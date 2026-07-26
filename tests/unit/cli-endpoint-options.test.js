import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildEndpointOptions,
  ensureV1,
} from "../../src/app/(dashboard)/dashboard/cli-tools/components/cliEndpointOptions.js";

describe("CLI endpoint options", () => {
  it.each([
    ["development", "http://localhost:20127", "http://localhost:20127/v1"],
    ["packaged app", "http://localhost:20128", "http://localhost:20128/v1"],
    ["Docker", "http://localhost:20129", "http://localhost:20129/v1"],
    ["reverse proxy", "https://potluck.example.com", "https://potluck.example.com/v1"],
  ])("uses the current %s origin", (_mode, origin, expected) => {
    const [local] = buildEndpointOptions({ localBaseUrl: origin });

    expect(local).toEqual({
      value: "local",
      label: expected,
      url: expected,
    });
  });

  it("does not offer the browser origin to clients that require an external URL", () => {
    const options = buildEndpointOptions({
      localBaseUrl: "http://localhost:20127",
      requiresExternalUrl: true,
      tunnelEnabled: true,
      tunnelPublicUrl: "https://tunnel.example.com/",
    });

    expect(options).toEqual([
      {
        value: "tunnel",
        label: "https://tunnel.example.com/v1",
        url: "https://tunnel.example.com/v1",
      },
    ]);
  });

  it("does not duplicate an existing v1 suffix", () => {
    expect(ensureV1("https://potluck.example.com/v1/")).toBe(
      "https://potluck.example.com/v1"
    );
  });

  it.each([
    "DeepSeekTuiToolCard.js",
    "HermesToolCard.js",
    "OpenClawToolCard.js",
    "JcodeToolCard.js",
  ])("does not hardcode the packaged-app port in %s", (filename) => {
    const source = readFileSync(
      new URL(
        `../../src/app/(dashboard)/dashboard/cli-tools/components/${filename}`,
        import.meta.url
      ),
      "utf8"
    );

    expect(source).not.toMatch(/(?:localhost|127\.0\.0\.1):20128/);
  });
});
