// Tool JSON-Schema sanitizer: repair schemas that strict validators
// (CommandCode "Invalid JSON schema", GLM 1210) reject before they reach upstream.
//
// Real-world clients emit schemas with schema-valued keywords set to "" or
// other non-schema values (e.g. `"items": ""`, `anyOf: ["", {...}]` — observed
// from Proma/CommandCode MCP tool dumps). Structural-keyword walk only:
// enum/const/default/examples and other value-bearing keywords are never
// touched, so an "" inside them stays valid data.

// Keywords whose value must be a single schema object.
const SCHEMA_KEYWORDS = [
  "contains", "not", "if", "then", "else", "propertyNames",
  "unevaluatedItems", "unevaluatedProperties",
];

// Keywords whose value is a map of name → schema.
const SCHEMA_MAP_KEYWORDS = [
  "properties", "patternProperties", "definitions", "$defs", "dependentSchemas",
];

// Keywords whose value is an array of schemas.
const SCHEMA_ARRAY_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const VALID_TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

// Clean one schema node in place. Returns true when the node is usable.
function cleanSchema(node) {
  if (!isPlainObject(node)) return false;

  // `type: ""` (or any non-type garbage) fails strict validators — CommandCode
  // reports it as `"" is not valid under any of the schemas listed in 'anyOf'`.
  if ("type" in node) {
    const t = node.type;
    const ok = (typeof t === "string" && VALID_TYPES.has(t))
      || (Array.isArray(t) && t.length > 0 && t.every(x => typeof x === "string" && VALID_TYPES.has(x)));
    if (!ok) delete node.type;
  }

  for (const key of SCHEMA_KEYWORDS) {
    if (key in node && !isPlainObject(node[key])) delete node[key];
  }

  // items: single schema (2020-12) or schema array (draft-07).
  if ("items" in node) {
    if (Array.isArray(node.items)) {
      node.items = node.items.filter(isPlainObject);
      node.items.forEach(cleanSchema);
      if (node.items.length === 0) delete node.items;
    } else if (!isPlainObject(node.items)) {
      delete node.items;
    } else {
      cleanSchema(node.items);
    }
  }

  // Boolean is a valid schema for these two — only other non-objects go.
  for (const key of ["additionalProperties", "additionalItems"]) {
    if (key in node && !isPlainObject(node[key]) && typeof node[key] !== "boolean") delete node[key];
  }

  for (const key of SCHEMA_MAP_KEYWORDS) {
    const map = node[key];
    if (map === undefined) continue;
    if (!isPlainObject(map)) { delete node[key]; continue; }
    for (const name of Object.keys(map)) {
      if (!isPlainObject(map[name]) || !cleanSchema(map[name])) delete map[name];
    }
    if (Object.keys(map).length === 0) delete node[key];
  }

  for (const key of SCHEMA_ARRAY_KEYWORDS) {
    const list = node[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { delete node[key]; continue; }
    const kept = list.filter(isPlainObject);
    kept.forEach(cleanSchema);
    if (kept.length === 0) delete node[key];
    else if (kept.length !== list.length) node[key] = kept;
  }

  return true;
}

// Sanitize every tool schema on a request body, in place. Handles OpenAI
// (tools[].function.parameters / tools[].parameters) and Claude-family
// (tools[].input_schema) tool shapes, including commandcode's params envelope.
export function sanitizeToolSchemas(body) {
  if (!body || typeof body !== "object") return body;

  const toolLists = [body.tools, body.params?.tools];
  for (const tools of toolLists) {
    if (!Array.isArray(tools)) continue;
    for (const tool of tools) {
      if (!isPlainObject(tool)) continue;
      const schema = tool.function?.parameters ?? tool.parameters ?? tool.input_schema;
      if (schema === undefined) continue;
      if (!isPlainObject(schema)) {
        // Whole-schema corruption → accept-anything schema beats a 400.
        if (tool.function) tool.function.parameters = { type: "object" };
        else if ("parameters" in tool) tool.parameters = { type: "object" };
        else tool.input_schema = { type: "object" };
        continue;
      }
      cleanSchema(schema);
    }
  }
  return body;
}

// ─── Tools payload budget ────────────────────────────────────────────────────
// The z.ai coding endpoints (and CommandCode's GLM-backed models behind them)
// reject requests whose serialized `tools` exceeds roughly ~115KB with a
// generic 1210 "Invalid API parameter" — while multi-MB `messages` pass fine.
// Clients with hundreds of MCP tools blow straight past it, so degrade the
// tools payload progressively instead of failing the whole request:
//   1. truncate the longest descriptions,
//   2. stub the largest parameter schemas (names/descriptions stay — the model
//      can still discover and call the tool, just without param details),
//   3. drop descriptions of the largest tools entirely.
// Every tool name always survives.

const BUDGET_DESC_MAX = 200;

function byteLength(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function schemaOf(tool) {
  return tool.function?.parameters ?? tool.parameters ?? tool.input_schema;
}

function setSchema(tool, schema) {
  if (tool.function) tool.function.parameters = schema;
  else if ("parameters" in tool) tool.parameters = schema;
  else tool.input_schema = schema;
}

function descriptionOf(tool) {
  return tool.function?.description ?? tool.description ?? "";
}

function setDescription(tool, desc) {
  if (tool.function) tool.function.description = desc;
  else tool.description = desc;
}

function measureTools(tools) {
  let total = 2; // array brackets
  for (const tool of tools) total += byteLength(tool) + 1;
  return total;
}

// Mutates body's tools list down to maxBytes. Returns null when untouched,
// else a short summary for logging.
export function enforceToolsJsonBudget(body, maxBytes) {
  const tools = Array.isArray(body?.tools) ? body.tools : Array.isArray(body?.params?.tools) ? body.params.tools : null;
  if (!tools || tools.length === 0) return null;
  if (measureTools(tools) <= maxBytes) return null;

  let truncatedDescriptions = 0;
  let stubbedSchemas = 0;
  let droppedDescriptions = 0;

  const byDescSize = () => tools
    .map((t, i) => [byteLength(descriptionOf(t)), i])
    .sort((a, b) => b[0] - a[0]);
  const bySchemaSize = () => tools
    .map((t, i) => [byteLength(schemaOf(t) || {}), i])
    .sort((a, b) => b[0] - a[0]);

  // Pass 1: truncate long descriptions.
  for (const [, i] of byDescSize()) {
    if (measureTools(tools) <= maxBytes) break;
    const desc = descriptionOf(tools[i]);
    if (byteLength(desc) <= BUDGET_DESC_MAX) break;
    setDescription(tools[i], desc.slice(0, BUDGET_DESC_MAX) + "…");
    truncatedDescriptions++;
  }

  // Pass 2: stub the largest schemas.
  for (const [, i] of bySchemaSize()) {
    if (measureTools(tools) <= maxBytes) break;
    const schema = schemaOf(tools[i]);
    if (!isPlainObject(schema) || byteLength(schema) <= 24) break;
    setSchema(tools[i], { type: "object" });
    stubbedSchemas++;
  }

  // Pass 3: drop descriptions of the largest tools entirely.
  for (const [, i] of byDescSize()) {
    if (measureTools(tools) <= maxBytes) break;
    if (!descriptionOf(tools[i])) break;
    setDescription(tools[i], "");
    droppedDescriptions++;
  }

  return `trimmed tools payload to fit ${maxBytes}B budget: ${truncatedDescriptions} descriptions truncated, ${stubbedSchemas} schemas stubbed, ${droppedDescriptions} descriptions dropped (all ${tools.length} tool names kept)`;
}
