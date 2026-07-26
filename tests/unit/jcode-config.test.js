import { describe, expect, it } from "vitest";
import { hasPotluckProvider } from "../../src/app/api/cli-tools/jcode-settings/jcodeConfig.js";

describe("jcode Potluck provider detection", () => {
  it("recognizes the provider by its stable configuration key", () => {
    expect(
      hasPotluckProvider({
        providers: {
          potluck: {
            type: "openai-compatible",
            base_url: "https://potluck.example.com/v1",
          },
        },
      })
    ).toBe(true);
  });

  it.each([
    "http://localhost:20127/v1",
    "http://localhost:20128/v1",
    "http://localhost:20129/v1",
  ])("does not mistake an unrelated provider at %s for Potluck", (baseUrl) => {
    expect(
      hasPotluckProvider({
        providers: {
          unrelated: {
            type: "openai-compatible",
            base_url: baseUrl,
          },
        },
      })
    ).toBe(false);
  });

  it.each([
    undefined,
    null,
    {},
    { providers: null },
    { providers: { potluck: null } },
    { providers: { potluck: [] } },
  ])("rejects malformed configuration %#", (config) => {
    expect(hasPotluckProvider(config)).toBe(false);
  });
});
