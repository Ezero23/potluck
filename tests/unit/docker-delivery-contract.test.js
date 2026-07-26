import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "../..");

function readProjectFile(file) {
  return fs.readFileSync(path.join(projectRoot, file), "utf8");
}

describe("Docker delivery contract", () => {
  it("starts Potluck without requiring a local .env file", () => {
    const compose = readProjectFile("docker-compose.yml");

    expect(compose).not.toMatch(/^\s*env_file:/m);
    expect(compose).toContain('"${PORT:-21023}:21023"');
    expect(compose).toContain('USE_CN_MIRROR: "${USE_CN_MIRROR:-false}"');
  });

  it("keeps Headroom optional for the default install", () => {
    const compose = readProjectFile("docker-compose.yml");

    expect(compose).toMatch(/headroom:[\s\S]*profiles:\s*\n\s+- headroom/);
    expect(compose).not.toMatch(/depends_on:[\s\S]*headroom/);
  });

  it("builds a health-checked image without upgrading the base system", () => {
    const dockerfile = readProjectFile("Dockerfile");

    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("/api/health");
    expect(dockerfile).not.toMatch(/apk(?:\s+--no-cache)?\s+upgrade/);
  });

  it("does not send generated dependencies and builds to Docker", () => {
    const dockerignore = readProjectFile(".dockerignore");

    expect(dockerignore).toContain("**/node_modules");
    expect(dockerignore).toContain(".next-cli-build");
    expect(dockerignore).toContain("cli/.build-home");
  });

  it("uses an idempotent Compose startup with readiness waiting", () => {
    const script = readProjectFile("start.sh");

    expect(script).toContain("docker compose up --detach --build --wait");
    expect(script).not.toMatch(/docker (?:stop|rm|run) /);
  });
});
