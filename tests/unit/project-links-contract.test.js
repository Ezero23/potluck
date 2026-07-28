import { describe, expect, it } from "vitest";
import {
  SKILLS_BLOB_BASE,
  SKILLS_RAW_BASE,
  SKILLS_REPO_URL,
  SKILLS_TREE_URL,
  getSkillBlobUrl,
  getSkillRawUrl,
} from "../../src/shared/constants/skills.js";

describe("public project links", () => {
  it("uses the canonical Potluck repository and main branch for skills", () => {
    expect(SKILLS_REPO_URL).toBe("https://github.com/Ezero23/potluck");
    expect(SKILLS_RAW_BASE).toBe(
      "https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills",
    );
    expect(SKILLS_BLOB_BASE).toBe(
      "https://github.com/Ezero23/potluck/blob/main/skills",
    );
    expect(SKILLS_TREE_URL).toBe(
      "https://github.com/Ezero23/potluck/tree/main/skills",
    );
    expect(getSkillRawUrl("potluck")).toBe(`${SKILLS_RAW_BASE}/potluck/SKILL.md`);
    expect(getSkillBlobUrl("potluck")).toBe(`${SKILLS_BLOB_BASE}/potluck/SKILL.md`);
  });
});
