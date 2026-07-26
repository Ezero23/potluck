import { OPENAI_BLOCK } from "../schema/index.js";

// OpenAI-compatible text-only messages are safest as a plain string. Preserve
// arrays when they contain images or any other multimodal block.
export function collapseTextParts(parts) {
  if (parts.length > 0 && parts.every((part) => part.type === OPENAI_BLOCK.TEXT)) {
    return parts.map((part) => part.text || "").join("\n");
  }
  return parts;
}
