/**
 * Purpose: unit tests for the occupation profile builder (spec 026/027) — branch structure
 * and kind typing, core-task preference and cap, verbatim task text in sourceRef, the ESCO
 * knowledge branch (sections, narrower sub-nodes, dedup, descriptor replacement), the
 * timeliness-patch branch, and schema validity of the result.
 */
import { describe, expect, it } from "vitest";
import {
  buildOccupationProfile,
  type EscoDataForOccupation,
  MAX_PRACTICE_TASKS,
  type OnetOccupation,
  occupationProfileId,
} from "./occupationProfile";
import { buildOverlapTree } from "./overlap";
import { findProfileStructureError, profileDefinitionSchema } from "./profileSchema";

function occupation(overrides: Partial<OnetOccupation> = {}): OnetOccupation {
  return {
    code: "15-1254.00",
    title: "Web Developers",
    description: "Develop and implement websites.",
    alt: ["Web Application Developer"],
    tasks: [
      { id: "100", text: "Write supportable and maintainable code for websites.", core: true },
      { id: "101", text: "Back up files from websites to local directories.", core: false },
    ],
    tech: [
      { name: "JavaScript", hot: true },
      { name: "git", hot: false },
    ],
    knowledge: [{ name: "Computers and Electronics", importance: 4.3 }],
    skills: [
      { name: "Programming", importance: 4.1 },
      { name: "Computers and Electronics", importance: 3.5 }, // duplicate name — must dedupe
    ],
    ...overrides,
  };
}

describe("buildOccupationProfile", () => {
  it("builds a schema-valid three-branch profile with kind-typed leaves", () => {
    const profile = buildOccupationProfile(occupation());
    expect(profileDefinitionSchema.safeParse(profile).success).toBe(true);
    expect(findProfileStructureError(profile)).toBeNull();
    expect(profile.id).toBe(occupationProfileId("15-1254.00"));
    expect(profile.category).toBe("occupation");
    const kinds = new Map(profile.items.map((item) => [item.key, item.kind]));
    expect(kinds.get("task-100")).toBe("practice");
    expect(kinds.get("tech-0")).toBe("tool");
    expect(kinds.get("know-0")).toBe("knowledge");
  });

  it("prefers core tasks and keeps the verbatim text in the sourceRef", () => {
    const profile = buildOccupationProfile(occupation());
    const taskLeaves = profile.items.filter((item) => item.kind === "practice");
    expect(taskLeaves).toHaveLength(1); // only the core one
    expect(taskLeaves[0]?.sourceRef).toContain("Write supportable and maintainable code");
  });

  it("falls back to supplemental tasks when no core tasks exist and caps the count", () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      id: `${index}`,
      text: `Task number ${index} description.`,
      core: false,
    }));
    const profile = buildOccupationProfile(occupation({ tasks: many }));
    const taskLeaves = profile.items.filter((item) => item.kind === "practice");
    expect(taskLeaves).toHaveLength(MAX_PRACTICE_TASKS);
  });

  it("dedupes knowledge/skill descriptors by name", () => {
    const profile = buildOccupationProfile(occupation());
    const knowledgeLeaves = profile.items.filter((item) => item.kind === "knowledge");
    expect(knowledgeLeaves.map((item) => item.label).sort()).toEqual([
      "Computers and Electronics",
      "Programming",
    ]);
  });

  it("adds the timeliness patch as its own branch with posting evidence", () => {
    const profile = buildOccupationProfile(occupation(), [
      {
        label: "React",
        postings: 12,
        sampleQuote: "Experience with React required",
        fetchedAt: "2026-08-10T00:00:00Z",
      },
    ]);
    const patchLeaf = profile.items.find((item) => item.key === "patch-0");
    expect(patchLeaf?.sourceRef).toContain("12 个真实岗位提及");
    expect(patchLeaf?.sourceRef).toContain("React required");
  });
});

function escoData(): EscoDataForOccupation {
  return {
    entry: {
      via: [{ title: "web developer", matchType: "exactMatch" }],
      essential: [{ id: "prog", children: ["haskell", "js"] }],
      optional: [{ id: "js" }, { id: "jenkins" }],
    },
    concepts: {
      prog: { label: "computer programming", type: "knowledge", aliases: ["programming"] },
      haskell: { label: "Haskell", type: "knowledge", aliases: [] },
      js: { label: "JavaScript", type: "knowledge", aliases: ["JS"] },
      jenkins: { label: "Jenkins", type: "tool", aliases: [] },
    },
  };
}

describe("ESCO knowledge branch (spec 027)", () => {
  it("replaces coarse descriptors with essential/optional sections and narrower sub-nodes", () => {
    const profile = buildOccupationProfile(occupation(), [], escoData());
    expect(profileDefinitionSchema.safeParse(profile).success).toBe(true);
    expect(findProfileStructureError(profile)).toBeNull();
    // Coarse O*NET descriptors are gone; the ESCO branch stands in their place.
    expect(profile.items.find((item) => item.key === "knowledge")).toBeUndefined();
    expect(profile.items.find((item) => item.key === "esco")?.label).toBe("知识与技能");
    const byKey = new Map(profile.items.map((item) => [item.key, item]));
    // Broad concept became a sub-node whose children are its narrower concepts.
    expect(byKey.get("esco-prog")?.parentKey).toBe("esco-ess");
    expect(byKey.get("esco-haskell")?.parentKey).toBe("esco-prog");
    expect(byKey.get("esco-haskell")?.kind).toBe("knowledge");
    expect(byKey.get("esco-haskell")?.sourceRef).toContain("exactMatch");
    // "js" is claimed by the essential parent's children first, never repeated in 可选.
    expect(byKey.get("esco-js")?.parentKey).toBe("esco-prog");
    expect(byKey.get("esco-jenkins")?.parentKey).toBe("esco-opt");
    expect(byKey.get("esco-jenkins")?.aliases).toEqual([]);
    expect(byKey.get("esco-js")?.aliases).toEqual(["JS"]);
  });

  it("keeps the descriptor fallback for crosswalk-uncovered occupations", () => {
    const profile = buildOccupationProfile(occupation(), [], null);
    expect(profile.items.find((item) => item.key === "esco")).toBeUndefined();
    expect(profile.items.find((item) => item.key === "knowledge")?.label).toBe("知识领域");
  });
});

describe("practice attestation scoring through buildOverlapTree", () => {
  it("scores practice leaves by attested value and mixes with knowledge leaves", () => {
    const profile = buildOccupationProfile(occupation());
    const practiceValues = new Map([["task-100", 0.5]]);
    const roots = buildOverlapTree(profile.items, new Map(), () => false, practiceValues);
    const tasksBranch = roots.find((root) => root.key === "tasks");
    expect(tasksBranch?.matchedLeafCount).toBeCloseTo(0.5);
    expect(tasksBranch?.ratio).toBeCloseTo(0.5);
    const knowledgeBranch = roots.find((root) => root.key === "knowledge");
    expect(knowledgeBranch?.ratio).toBe(0);
  });
});
