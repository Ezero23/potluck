import { DEFAULT_LANG } from "./languages";

// Navigation structure (slugs are shared). Labels are per-language.
const NAV_STRUCTURE = [
  {
    key: "gettingStarted",
    items: [
      { key: "introduction", slug: "" },
      { key: "quickStart", slug: "getting-started/quick-start" },
      { key: "installation", slug: "getting-started/installation" }
    ]
  },
  {
    key: "providers",
    items: [
      { key: "subscription", slug: "providers/subscription" },
      { key: "cheap", slug: "providers/cheap" },
      { key: "free", slug: "providers/free" }
    ]
  },
  {
    key: "features",
    items: [
      { key: "combos", slug: "features/combos" },
      { key: "quotaTracking", slug: "features/quota-tracking" }
    ]
  },
  {
    key: "integration",
    items: [
      { key: "claudeCode", slug: "integration/claude-code" },
      { key: "codex", slug: "integration/codex" },
      { key: "cline", slug: "integration/cline" },
      { key: "roo", slug: "integration/roo" },
      { key: "continue", slug: "integration/continue" },
      { key: "otherTools", slug: "integration/other-tools" }
    ]
  },
  {
    key: "deployment",
    items: [
      { key: "localhost", slug: "deployment/localhost" },
      { key: "cloud", slug: "deployment/cloud" }
    ]
  },
  {
    key: "help",
    items: [
      { key: "troubleshooting", slug: "troubleshooting" },
      { key: "faq", slug: "faq" }
    ]
  }
];

// Translations for section/item titles (2 langs).
const TRANSLATIONS = {
  en: {
    gettingStarted: "Getting Started",
    introduction: "Introduction",
    quickStart: "Quick Start",
    installation: "Installation",
    providers: "Providers",
    subscription: "Subscription Access",
    cheap: "API-key Providers",
    free: "Trials & Promotions",
    features: "Features",
    combos: "Combos & Fallback",
    quotaTracking: "Quota Tracking",
    integration: "Integration",
    claudeCode: "Claude Code",
    codex: "OpenAI Codex",
    cline: "Cline",
    roo: "Roo",
    continue: "Continue",
    otherTools: "Other Tools",
    deployment: "Deployment",
    localhost: "Localhost",
    cloud: "Server & Container",
    help: "Help",
    troubleshooting: "Troubleshooting",
    faq: "FAQ",
    goToApp: "Project Repository",
    selectLanguage: "Select Language",
    onThisPage: "On this page"
  },
  "zh-CN": {
    gettingStarted: "开始使用",
    introduction: "简介",
    quickStart: "快速开始",
    installation: "安装",
    providers: "提供商",
    subscription: "订阅型访问",
    cheap: "API Key 提供商",
    free: "试用与促销",
    features: "功能",
    combos: "组合与回退",
    quotaTracking: "配额跟踪",
    integration: "集成",
    claudeCode: "Claude Code",
    codex: "OpenAI Codex",
    cline: "Cline",
    roo: "Roo",
    continue: "Continue",
    otherTools: "其他工具",
    deployment: "部署",
    localhost: "本地",
    cloud: "服务器与容器",
    help: "帮助",
    troubleshooting: "故障排查",
    faq: "常见问题",
    goToApp: "项目仓库",
    selectLanguage: "选择语言",
    onThisPage: "本页内容"
  }
};

// Translate one key for given language with fallback to default.
export function t(lang, key) {
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS[DEFAULT_LANG][key] || key;
}

// Build localized navigation for sidebar.
export function getNavigation(lang) {
  return NAV_STRUCTURE.map(section => ({
    key: section.key,
    title: t(lang, section.key),
    items: section.items.map(item => ({
      key: item.key,
      slug: item.slug,
      title: t(lang, item.key)
    }))
  }));
}

// Static config (logo, urls, default English nav for backward compatibility).
export const DOCS_CONFIG = {
  title: "Potluck Documentation",
  description: "Documentation for the self-hosted Potluck model-source router",
  logo: "Potluck",
  appUrl: "https://github.com/Ezero23/potluck",
  githubUrl: "https://github.com/Ezero23/potluck",
  navigation: getNavigation(DEFAULT_LANG)
};
