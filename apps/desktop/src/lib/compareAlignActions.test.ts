/**
 * Purpose: regression tests for the anchor sweep's cost controls (design audit 2026-08-28 #2)
 * — the hard per-sweep batch budget that replaced an unbounded walk down a 66,000-pair
 * candidate list, the "no unanchored nodes means spend nothing" early exit, and the concept
 * embedding cache that stopped re-embedding the whole canonical inventory every single sweep.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listConceptsMock = vi.fn();
const listAnchorsMock = vi.fn();
const listAllNodesMock = vi.fn();
const listAllEmbeddingsMock = vi.fn();
const upsertAnchorsMock = vi.fn();
const listConceptEmbeddingsMock = vi.fn();
const upsertConceptEmbeddingsMock = vi.fn();
vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    canonical: {
      listConcepts: listConceptsMock,
      listAnchors: listAnchorsMock,
      upsertAnchors: upsertAnchorsMock,
      upsertConcepts: vi.fn(),
      listConceptEmbeddings: listConceptEmbeddingsMock,
      upsertConceptEmbeddings: upsertConceptEmbeddingsMock,
    },
    knowledgeNodes: { listAll: listAllNodesMock },
    nodeEmbeddings: { listAll: listAllEmbeddingsMock },
  })),
}));

const embedTextsMock = vi.fn();
vi.mock("./embeddings", () => ({ embedTexts: embedTextsMock }));

vi.mock("./canonicalConcepts", async () => {
  const actual = await vi.importActual<typeof import("./canonicalConcepts")>("./canonicalConcepts");
  return {
    ...actual,
    ensureCanonicalConcepts: vi.fn(async () => {}),
    anchorNodesByAlias: vi.fn(async () => {}),
  };
});

vi.mock("./failureLog", () => ({ recordAiFailure: vi.fn() }));
vi.mock("./metering", () => ({ recordMeteredCall: vi.fn() }));
vi.mock("./llmConfig", () => ({
  llmConfigFrom: () => ({ baseUrl: "u", apiKey: "k", model: "m", fetchImpl: fetch }),
}));
vi.mock("./time", () => ({ nowIso: () => "2026-08-28T10:00:00.000Z" }));

const settingsState = {
  featureSwitches: { compareAlignment: true },
  networkEnabled: true,
  apiConfig: { model: "m" },
};
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settingsState },
}));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const { ANCHOR_SWEEP_BATCH_BUDGET, runAnchorSweep } = await import("./compareAlignActions");
const { ALIGNMENT_JUDGE_BATCH_SIZE } = await import("@breadcrumb/plugin-compare");

const DIMENSIONS = 8;

/** A vector in the real model's narrow high-cosine band; `axis` decides which few partners
 * stand out for it. Not orthogonal fixtures — see similarityGate.ts for why. */
function packedVector(axis: number, lean: number): number[] {
  const base = 1 / Math.sqrt(DIMENSIONS);
  const vector = new Array<number>(DIMENSIONS).fill(base);
  vector[axis % DIMENSIONS] = base + lean;
  return vector;
}

function concept(index: number): {
  id: string;
  label: string;
  aliases_json: string;
  source_ref: string;
  created_at: string;
} {
  return {
    id: `c${index}`,
    label: `概念${index}`,
    aliases_json: "[]",
    source_ref: "某教材",
    created_at: "t",
  };
}

function node(index: number): {
  id: string;
  parent_id: null;
  label: string;
  summary: string;
  kind: "concept";
  created_at: string;
} {
  return {
    id: `n${index}`,
    parent_id: null,
    label: `节点${index}`,
    summary: "s",
    kind: "concept",
    created_at: "t",
  };
}

beforeEach(() => {
  listAnchorsMock.mockResolvedValue([]);
  listConceptEmbeddingsMock.mockResolvedValue([]);
  upsertAnchorsMock.mockResolvedValue(undefined);
  upsertConceptEmbeddingsMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runAnchorSweep cost controls", () => {
  it("spends nothing at all when every node already carries a confident anchor", async () => {
    const nodes = [node(0), node(1)];
    listAllNodesMock.mockResolvedValue(nodes);
    listConceptsMock.mockResolvedValue([concept(0)]);
    listAnchorsMock.mockResolvedValue(
      nodes.map((entry) => ({ node_id: entry.id, concept_id: "c0", verdict: "same" })),
    );

    const judged = await runAnchorSweep();

    expect(judged).toBe(0);
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("never exceeds ANCHOR_SWEEP_BATCH_BUDGET judge calls, however long the candidate list is", async () => {
    // 60 nodes x 200 concepts: pre-budget this walked the list forever, three concepts deeper
    // per visit to the comparison page, and never converged.
    const nodes = Array.from({ length: 60 }, (_unused, index) => node(index));
    const concepts = Array.from({ length: 200 }, (_unused, index) => concept(index));
    listAllNodesMock.mockResolvedValue(nodes);
    listConceptsMock.mockResolvedValue(concepts);
    listAllEmbeddingsMock.mockResolvedValue(
      nodes.map((entry, index) => ({
        node_id: entry.id,
        model: "test",
        vector_json: JSON.stringify(packedVector(index, 0.5 + (index % 5) * 0.01)),
        created_at: "t",
      })),
    );
    embedTextsMock.mockImplementation(async (texts: readonly string[]) =>
      texts.map((_unused, index) => packedVector(index, 0.5 + (index % 7) * 0.01)),
    );
    chatJsonMock.mockImplementation(
      async (_config, messages: { role: string; content: string }[]) => {
        const user = messages.find((message) => message.role === "user");
        const count = (user?.content.match(/^对\d+：/gmu) ?? []).length;
        return {
          parsed: {
            verdicts: Array.from({ length: count }, (_unused, index) => ({
              pair: index + 1,
              verdict: "different" as const,
              confidence: "high" as const,
              reason: "不是同一个",
            })),
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    );

    const judged = await runAnchorSweep();

    expect(chatJsonMock.mock.calls.length).toBeLessThanOrEqual(ANCHOR_SWEEP_BATCH_BUDGET);
    expect(chatJsonMock.mock.calls.length).toBeGreaterThan(0);
    expect(judged).toBeLessThanOrEqual(ANCHOR_SWEEP_BATCH_BUDGET * ALIGNMENT_JUDGE_BATCH_SIZE);
  });

  it("embeds only the concepts whose cached content hash is stale", async () => {
    const concepts = [concept(0), concept(1), concept(2)];
    listAllNodesMock.mockResolvedValue([node(0)]);
    listConceptsMock.mockResolvedValue(concepts);
    listAllEmbeddingsMock.mockResolvedValue([
      {
        node_id: "n0",
        model: "test",
        vector_json: JSON.stringify(packedVector(0, 0.5)),
        created_at: "t",
      },
    ]);
    const { hashText } = await import("./canonicalConceptVectors");
    listConceptEmbeddingsMock.mockResolvedValue([
      {
        concept_id: "c0",
        content_hash: hashText("概念0"),
        vector_json: JSON.stringify(packedVector(0, 0.52)),
        created_at: "t",
      },
      {
        concept_id: "c1",
        content_hash: "stale",
        vector_json: JSON.stringify(packedVector(1, 0.5)),
        created_at: "t",
      },
    ]);
    embedTextsMock.mockResolvedValue([packedVector(1, 0.5), packedVector(2, 0.5)]);
    chatJsonMock.mockResolvedValue({
      parsed: {
        verdicts: [{ pair: 1, verdict: "different", confidence: "high", reason: "r" }],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await runAnchorSweep();

    expect(embedTextsMock).toHaveBeenCalledTimes(1);
    // c0's hash still matches, so only c1 (stale) and c2 (absent) are re-embedded.
    expect(embedTextsMock.mock.calls[0]?.[0]).toEqual(["概念1", "概念2"]);
    expect(upsertConceptEmbeddingsMock).toHaveBeenCalledTimes(1);
    const storedRows = (upsertConceptEmbeddingsMock.mock.calls[0]?.[0] ?? []) as {
      concept_id: string;
    }[];
    expect(storedRows.map((row) => row.concept_id)).toEqual(["c1", "c2"]);
  });
});
