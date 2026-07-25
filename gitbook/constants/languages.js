export const DEFAULT_LANG = "en";

export const LANGUAGES = [
  { code: "en", name: "English", native: "English", flag: "🇺🇸" },
  { code: "zh-CN", name: "Chinese (Simplified)", native: "简体中文", flag: "🇨🇳" }
];

export const LANG_CODES = LANGUAGES.map(l => l.code);

export function isValidLang(code) {
  return LANG_CODES.includes(code);
}

export function getLanguage(code) {
  return LANGUAGES.find(l => l.code === code) || LANGUAGES[0];
}
