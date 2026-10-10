import { createHash } from "node:crypto";
import { MAX_TOOL_NAME_LENGTH } from "../../config/runtimeConfig.js";

// Visit only protocol fields, never tool arguments or JSON schemas.
function visitNames(body, visit) {
  if (!body || typeof body !== "object") return;
  const item = (value) => {
    if (!value || typeof value !== "object") return;
    if (["tool_use", "function_call"].includes(value.type)) visit(value, "name");
    if (["tool-call", "tool-result"].includes(value.type)) visit(value, "toolName");
    if (value.role === "tool") visit(value, "name");
    if (value.function) visit(value.function, "name");
    if (value.functionCall) visit(value.functionCall, "name");
    for (const key of ["content", "parts", "tool_calls"]) {
      if (Array.isArray(value[key])) value[key].forEach(item);
    }
    for (const key of ["delta", "message", "item", "content_block"]) item(value[key]);
  };
  for (const tool of body.tools || []) {
    if (tool.function) visit(tool.function, "name");
    else if (!tool.type || tool.type === "function" || tool.type === "custom") visit(tool, "name");
    for (const declaration of tool.functionDeclarations || []) visit(declaration, "name");
  }
  if (body.tool_choice?.function) visit(body.tool_choice.function, "name");
  else if (body.tool_choice?.type === "tool" || body.tool_choice?.type === "function") visit(body.tool_choice, "name");
  for (const key of ["messages", "contents", "input", "output", "choices"]) {
    if (Array.isArray(body[key])) body[key].forEach(item);
  }
  item(body);
  visitNames(body.params, visit);
  visitNames(body.request, visit);
  visitNames(body.response, visit);
}

export function normalizeToolNames(body) {
  const names = new Set();
  visitNames(body, (object, key) => {
    if (typeof object[key] === "string") names.add(object[key]);
  });
  const aliases = new Map();
  const reverse = new Map(body._toolNameMap || []);
  for (const name of names) {
    if (name.length <= MAX_TOOL_NAME_LENGTH) continue;
    let alias;
    let salt = 0;
    do {
      const hash = createHash("sha256").update(`${name}:${salt++}`).digest("hex").slice(0, 16);
      alias = `${name.slice(0, MAX_TOOL_NAME_LENGTH - hash.length - 1)}_${hash}`;
    } while (names.has(alias));
    names.add(alias);
    aliases.set(name, alias);
    reverse.set(alias, reverse.get(name) || name);
  }
  if (!aliases.size) return body;
  const result = structuredClone(body);
  visitNames(result, (object, key) => {
    if (aliases.has(object[key])) object[key] = aliases.get(object[key]);
  });
  result._toolNameMap = reverse;
  return result;
}

export function restoreToolNames(body, names) {
  if (!names?.size || !body || typeof body !== "object") return body;
  const result = structuredClone(body);
  visitNames(result, (object, key) => {
    if (names.has(object[key])) object[key] = names.get(object[key]);
  });
  return result;
}
