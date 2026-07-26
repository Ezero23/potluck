import fs from "node:fs";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath) => (
  fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8")
);

describe("main service port contract", () => {
  it.each([
    "scripts/start-standalone.sh",
    "scripts/potluck",
    "start.sh",
  ])("uses 21023 and contains no legacy main-service port in %s", (relativePath) => {
    const source = readProjectFile(relativePath);

    expect(source).toContain("21023");
    expect(source).not.toMatch(/\b2012[789]\b/);
  });

  it("uses the shared application default when restoring a tunnel", () => {
    const source = readProjectFile("src/shared/services/initializeApp.js");

    expect(source).toContain(
      "parseInt(process.env.PORT, 10) || APP_CONFIG.defaultPort",
    );
    expect(source).not.toMatch(/\b2012[789]\b/);
  });
});
