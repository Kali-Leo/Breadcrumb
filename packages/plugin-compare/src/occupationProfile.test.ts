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
    expect(kinds.get("tech-0")).toBe("hub");
    expect(kinds.get("know-0")).toBe("hub");
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
    const descriptorHubs = profile.items.filter((item) => item.key.startsWith("know-"));
    expect(descriptorHubs.map((item) => item.label).sort()).toEqual([
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
      optional: [{ id: "js" }, { id: "debug" }],
    },
    concepts: {
      prog: { label: "computer programming", type: "knowledge", aliases: ["programming"] },
      haskell: { label: "Haskell", type: "knowledge", aliases: [] },
      js: { label: "JavaScript", type: "knowledge", aliases: ["JS"] },
      debug: { label: "debug software", type: "skill", aliases: [] },
    },
  };
}

describe("ESCO knowledge branch (spec 027/028)", () => {
  it("types knowledge concepts as unscored hubs and skill phrases as attested practice", () => {
    const profile = buildOccupationProfile(occupation(), [], escoData());
    expect(profileDefinitionSchema.safeParse(profile).success).toBe(true);
    expect(findProfileStructureError(profile)).toBeNull();
    expect(profile.items.find((item) => item.key === "knowledge")).toBeUndefined();
    const byKey = new Map(profile.items.map((item) => [item.key, item]));
    expect(byKey.get("esco-prog")?.kind).toBe("hub");
    expect(byKey.get("esco-haskell")?.parentKey).toBe("esco-prog");
    expect(byKey.get("esco-haskell")?.kind).toBe("hub");
    expect(byKey.get("esco-js")?.parentKey).toBe("esco-prog");
    expect(byKey.get("esco-debug")?.kind).toBe("practice");
    expect(byKey.get("esco-debug")?.parentKey).toBe("esco-opt");
  });

  it("granularity gate (spec 028): no ESCO concept is ever a binary-scored leaf", () => {
    const profile = buildOccupationProfile(occupation(), [], escoData());
    const offenders = profile.items.filter(
      (item) => item.key.startsWith("esco-") && item.kind === "knowledge",
    );
    expect(offenders).toEqual([]);
  });

  it("mounts a canonical subtree under the matching hub and aggregates from it", () => {
    const mounts = new Map([
      [
        "javascript",
        {
          id: "mdn-js",
          note: "MDN Curriculum 的 JavaScript 模块",
          items: [
            {
              key: "vars",
              parentKey: null,
              label: "变量",
              aliases: [],
              sourceRef: "MDN Curriculum · Variables",
              conceptId: null,
              kind: "knowledge" as const,
            },
          ],
        },
      ],
    ]);
    const esco = { ...escoData(), mounts };
    const profile = buildOccupationProfile(occupation(), [], esco);
    expect(findProfileStructureError(profile)).toBeNull();
    const mounted = profile.items.find((item) => item.key === "m-mdn-js-vars");
    expect(mounted?.parentKey).toBe("esco-js");
    expect(mounted?.kind).toBe("knowledge");
    const hub = profile.items.find((item) => item.key === "esco-js");
    expect(hub?.sourceRef).toContain("已挂载");
    // The mounted knowledge point scores; hubs stay out of every denominator.
    const matches = new Map([
      [
        "m-mdn-js-vars",
        {
          itemKey: "m-mdn-js-vars",
          nodeId: "n1",
          nodeLabel: "变量",
          via: "label" as const,
          matchedText: "变量",
        },
      ],
    ]);
    // Denominator: the mounted knowledge point + the attested skill phrase; the three
    // hubs (prog/haskell/js) contribute nothing.
    const roots = buildOverlapTree(profile.items, matches, () => true);
    const escoBranch = roots.find((root) => root.key === "esco");
    expect(escoBranch?.leafCount).toBe(2);
    expect(escoBranch?.matchedLeafCount).toBe(1);
  });

  it("keeps the descriptor fallback as unscored hubs for uncovered occupations", () => {
    const profile = buildOccupationProfile(occupation(), [], null);
    expect(profile.items.find((item) => item.key === "esco")).toBeUndefined();
    const know = profile.items.find((item) => item.key === "know-0");
    expect(know?.kind).toBe("hub");
  });
});

describe("entity leaves are never scored (spec 029)", () => {
  it("keeps tech and patch entities out of every denominator, match surviving as 线索", () => {
    const profile = buildOccupationProfile(occupation(), [
      {
        label: "LLM",
        postings: 14,
        sampleQuote: "LLM experience",
        fetchedAt: "2026-08-10T00:00:00Z",
      },
    ]);
    const matches = new Map([
      [
        "tech-0",
        {
          itemKey: "tech-0",
          nodeId: "n1",
          nodeLabel: "JavaScript",
          via: "label" as const,
          matchedText: "JavaScript",
        },
      ],
    ]);
    const roots = buildOverlapTree(profile.items, matches, () => true, new Map([["tech-0", 1]]));
    const techBranch = roots.find((root) => root.key === "tech");
    expect(techBranch?.leafCount).toBe(0);
    expect(techBranch?.matchedLeafCount).toBe(0);
    const jsLeaf = techBranch?.children.find((child) => child.key === "tech-0");
    expect(jsLeaf?.kind).toBe("hub");
    expect(jsLeaf?.match?.nodeLabel).toBe("JavaScript");
    const patchBranch = roots.find((root) => root.key === "patch");
    expect(patchBranch?.leafCount).toBe(0);
    expect(patchBranch?.children[0]?.kind).toBe("hub");
  });

  it("scores an experience leaf by the 0-10 score normalized to 0-1", () => {
    const profile = buildOccupationProfile(occupation());
    const roots = buildOverlapTree(
      profile.items,
      new Map(),
      () => false,
      new Map([["task-100", 0.7]]),
    );
    const tasksBranch = roots.find((root) => root.key === "tasks");
    expect(tasksBranch?.matchedLeafCount).toBeCloseTo(0.7);
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
