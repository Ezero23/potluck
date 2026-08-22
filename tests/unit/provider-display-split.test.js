// Guards E1: display fields live in providersDisplay.js, merged back into AI_PROVIDERS (shape unchanged).
import { describe, it, expect } from "vitest";

const DISPLAY_FIELDS = ["name", "icon", "color"];

describe("provider display split (E1)", () => {
  it("AI_PROVIDERS entries still carry merged display + transport", async () => {
    const { AI_PROVIDERS } = await import("../../src/shared/constants/providers.js");
    const kiro = AI_PROVIDERS.kiro;
    // display merged
    expect(kiro.name).toBe("Kiro AI");
    expect(kiro.icon).toBe("psychology_alt");
    // transport kept
    expect(kiro.id).toBe("kiro");
    expect(kiro.alias).toBe("kr");
    // transport-heavy provider keeps its config
    expect(AI_PROVIDERS.gemini.serviceKinds).toContain("tts");
    expect(AI_PROVIDERS.gemini.ttsConfig).toBeTruthy();
  });

  it("display fields source from providersDisplay.js", async () => {
    const { PROVIDER_DISPLAY } = await import("../../src/shared/constants/providersDisplay.js");
    const { AI_PROVIDERS } = await import("../../src/shared/constants/providers.js");
    for (const f of DISPLAY_FIELDS) {
      expect(PROVIDER_DISPLAY.kiro[f]).toBe(AI_PROVIDERS.kiro[f]);
    }
  });

  it("helpers still work after split", async () => {
    const m = await import("../../src/shared/constants/providers.js");
    expect(m.ALIAS_TO_ID.kr).toBe("kiro");
    expect(m.getProvidersByKind("tts").length).toBeGreaterThan(0);
  });

  it("distinguishes recurring free quotas from trials and regional limits", async () => {
    const { FREE_TIER_GUIDANCE } = await import("../../src/shared/constants/providersDisplay.js");
    const { AI_PROVIDERS } = await import("../../src/shared/constants/providers.js");

    expect(FREE_TIER_GUIDANCE.openrouter.badge).toBe("50 free req/day");
    expect(FREE_TIER_GUIDANCE.openrouter.detail).toContain("$10 of lifetime credit purchases");
    expect(FREE_TIER_GUIDANCE.vertex.kind).toBe("welcome-credit");
    expect(FREE_TIER_GUIDANCE.byteplus.kind).toBe("trial-tokens");
    expect(FREE_TIER_GUIDANCE.gemini.kind).toBe("region-and-model-limited");
    expect(FREE_TIER_GUIDANCE.nvidia.kind).toBe("development-trial");
    expect(AI_PROVIDERS["cloudflare-ai"].freeTier.badge).toBe("10K neurons/day");
    expect(AI_PROVIDERS.ollama.notice.text).toContain("every 5 hours");
    expect(AI_PROVIDERS.openrouter.notice.text).not.toContain("no credit card needed");
  });
});
