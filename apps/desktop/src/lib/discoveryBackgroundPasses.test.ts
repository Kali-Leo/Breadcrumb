/**
 * Purpose: unit tests for the passes that run behind the feed — the quality check works through
 * the pool's unrated backlog rather than one round's landings, its scores are written to the cards
 * it rated and nowhere else, an unrated card is left unrated rather than marked bad, and the
 * embedding pass fills in whatever the pool is still missing without ever failing the round.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

let missingEmbedding: DiscoveryCardRow[] = [];
let missingQualityScore: DiscoveryCardRow[] = [];
const setCardQualityScoreMock = vi.fn(async (id: string, score: number) => {
  missingQualityScore = missingQualityScore.filter((row) => row.id !== id);
  void score;
});
const setCardEmbeddingMock = vi.fn(async () => {});

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      listCardsMissingEmbedding: async (limit: number) => missingEmbedding.slice(0, limit),
      listCardsMissingQualityScore: async (limit: number) => missingQualityScore.slice(0, limit),
      setCardQualityScore: setCardQualityScoreMock,
      setCardEmbedding: setCardEmbeddingMock,
    },
  })),
}));

const scoreBatchQualityMock = vi.fn();
vi.mock("./discoveryQualityCheck", () => ({ scoreBatchQuality: scoreBatchQualityMock }));

const embedTextsMock = vi.fn();
vi.mock("./embeddings", () => ({ embedTexts: embedTextsMock }));

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({ recordAiFailure: recordAiFailureMock }));

const { contentFeatureParts, defaultContentFeatureWeights, QUALITY_CHECK_BATCH_CAP } = await import(
  "@breadcrumb/plugin-discovery"
);
const { embedPoolBacklog, NEUTRAL_QUALITY_SCORE, scoreQualityBacklog } = await import(
  "./discoveryBackgroundPasses"
);

function card(id: string, overrides: Partial<DiscoveryCardRow> = {}): DiscoveryCardRow {
  return {
    id,
    title: `title ${id}`,
    hook: "hook",
    topic_label: "topic",
    source: "explore",
    body_md: null,
    embedding_json: null,
    batch_id: "batch",
    created_at: "2026-08-17T00:00:00.000Z",
    opened_at: null,
    source_id: "sample",
    kind: "article",
    url: `https://example.org/${id}`,
    cover_url: null,
    author: null,
    published_at: "2026-08-17T00:00:00.000Z",
    saved_at: null,
    quality_score: null,
    upstream_signal: null,
    media_url: null,
    ...overrides,
  };
}

afterEach(() => {
  missingEmbedding = [];
  missingQualityScore = [];
  setCardQualityScoreMock.mockClear();
  setCardEmbeddingMock.mockClear();
  scoreBatchQualityMock.mockReset();
  embedTextsMock.mockReset();
  recordAiFailureMock.mockReset();
});

describe("scoreQualityBacklog", () => {
  it("writes a score for every card the check actually rated", async () => {
    missingQualityScore = [card("a"), card("b")];
    scoreBatchQualityMock.mockResolvedValue(
      new Map([
        ["a", 0.2],
        ["b", 0.9],
      ]),
    );
    await scoreQualityBacklog();
    expect(setCardQualityScoreMock).toHaveBeenCalledTimes(2);
    expect(setCardQualityScoreMock).toHaveBeenCalledWith("a", 0.2);
    expect(setCardQualityScoreMock).toHaveBeenCalledWith("b", 0.9);
  });

  it("leaves a card the check skipped unrated instead of guessing at it", async () => {
    missingQualityScore = [card("a")];
    scoreBatchQualityMock.mockResolvedValue(new Map());
    await scoreQualityBacklog();
    expect(setCardQualityScoreMock).not.toHaveBeenCalled();
  });

  it("costs nothing at all when every pooled card already has a score", async () => {
    await scoreQualityBacklog();
    expect(scoreBatchQualityMock).not.toHaveBeenCalled();
  });

  /**
   * FIXED (2026-08-17, spec 053 T10b). The pass used to rate exactly the rows the round it
   * followed had just landed. A fresh install's first restock runs about four seconds after
   * launch — before anyone could have typed an API key in — so scoreBatchQuality returned an
   * empty map with no call at all, and those hundred cards stayed unrated for as long as they
   * were in the pool, however many passes ran afterwards. The pass now reads the pool's unrated
   * backlog, so the first pass that runs with a key starts draining it.
   */
  it("picks up the cards an earlier pass could not rate, a batch at a time", async () => {
    missingQualityScore = Array.from({ length: QUALITY_CHECK_BATCH_CAP + 20 }, (_unused, index) =>
      card(`c${index}`),
    );
    // The first pass ran with no API config behind it: nothing rated, nothing lost.
    scoreBatchQualityMock.mockResolvedValueOnce(new Map());
    await scoreQualityBacklog();
    expect(setCardQualityScoreMock).not.toHaveBeenCalled();
    expect(missingQualityScore).toHaveLength(QUALITY_CHECK_BATCH_CAP + 20);

    // The reader has since entered a key; the next two passes work through the backlog.
    scoreBatchQualityMock.mockImplementation(
      async (items: readonly { id: string }[]) =>
        new Map(items.map((item) => [item.id, 0.5] as const)),
    );
    await scoreQualityBacklog();
    expect(setCardQualityScoreMock).toHaveBeenCalledTimes(QUALITY_CHECK_BATCH_CAP);
    expect(scoreBatchQualityMock.mock.calls[1]?.[0]).toHaveLength(QUALITY_CHECK_BATCH_CAP);
    await scoreQualityBacklog();
    expect(missingQualityScore).toEqual([]);
  });

  it("logs and moves on when the pass throws", async () => {
    missingQualityScore = [card("a")];
    scoreBatchQualityMock.mockRejectedValue(new Error("database closed"));
    await expect(scoreQualityBacklog()).resolves.toBeUndefined();
    expect(recordAiFailureMock).toHaveBeenCalledWith("discovery", expect.any(Error));
  });

  /**
   * FIXED (2026-08-18, spec 053 T10c). A background pass is started behind every restock, and
   * scrolling starts restocks faster than a pass finishes. Every one of them read the same unrated
   * top of the pool before any of them had written a score, so the same batch was sent to the
   * model again and again: a real first launch spent 203 metered calls — ¥0.5547 — rating 387
   * cards. Whoever arrives while a pass is in the air now joins it.
   */
  it("sends one batch however many restocks ask for a pass at once", async () => {
    missingQualityScore = Array.from({ length: QUALITY_CHECK_BATCH_CAP }, (_unused, index) =>
      card(`c${index}`),
    );
    scoreBatchQualityMock.mockImplementation(
      async (items: readonly { id: string }[]) =>
        new Map(items.map((item) => [item.id, 0.6] as const)),
    );
    await Promise.all([scoreQualityBacklog(), scoreQualityBacklog(), scoreQualityBacklog()]);
    expect(scoreBatchQualityMock).toHaveBeenCalledTimes(1);
    expect(setCardQualityScoreMock).toHaveBeenCalledTimes(QUALITY_CHECK_BATCH_CAP);
  });

  /**
   * FIXED (2026-08-18, spec 053 T10c). The model does not always answer for every card in the
   * batch, and a card it passed over stayed NULL — which is exactly what the next pass reads, so
   * the same card was submitted and billed for pass after pass. It leaves the backlog with the
   * neutral score instead, which ranks identically to unrated.
   */
  it("does not submit a card the model left out a second time", async () => {
    missingQualityScore = [card("a"), card("b")];
    scoreBatchQualityMock.mockResolvedValue(new Map([["a", 0.2]]));
    await scoreQualityBacklog();
    expect(setCardQualityScoreMock).toHaveBeenCalledWith("a", 0.2);
    expect(setCardQualityScoreMock).toHaveBeenCalledWith("b", NEUTRAL_QUALITY_SCORE);

    await scoreQualityBacklog();
    expect(scoreBatchQualityMock).toHaveBeenCalledTimes(1);
  });

  /** The neutral score is only honest if the ranking cannot tell it from an unrated card: the
   * quality check demotes below 0.35 and gives nothing for a high rating, so anything at or above
   * that floor contributes exactly what NULL does. */
  it("writes a neutral score the ranking treats exactly like unrated", () => {
    expect(NEUTRAL_QUALITY_SCORE).toBeGreaterThanOrEqual(
      defaultContentFeatureWeights.qualityDemotionThreshold,
    );
    const signals = { upstreamSignal: null, hasCover: false, publishedAt: null };
    const nowIso = "2026-08-18T00:00:00.000Z";
    const neutral = contentFeatureParts(
      { ...signals, qualityScore: NEUTRAL_QUALITY_SCORE },
      nowIso,
    );
    const unrated = contentFeatureParts({ ...signals, qualityScore: null }, nowIso);
    expect(neutral.demotion).toBe(0);
    expect(neutral).toEqual(unrated);
  });
});

describe("embedPoolBacklog", () => {
  it("embeds what the pool is missing and stores each vector", async () => {
    missingEmbedding = [card("a"), card("b")];
    embedTextsMock.mockResolvedValue([
      [1, 0],
      [0, 1],
    ]);
    await embedPoolBacklog();
    expect(embedTextsMock).toHaveBeenCalledWith(["title a：hook", "title b：hook"]);
    expect(setCardEmbeddingMock).toHaveBeenCalledWith("a", "[1,0]");
    expect(setCardEmbeddingMock).toHaveBeenCalledWith("b", "[0,1]");
  });

  it("leaves the cards alone — still readable — when embedding is unavailable", async () => {
    missingEmbedding = [card("a")];
    embedTextsMock.mockResolvedValue(null);
    await embedPoolBacklog();
    expect(setCardEmbeddingMock).not.toHaveBeenCalled();
  });

  it("logs and moves on when the pass throws", async () => {
    missingEmbedding = [card("a")];
    embedTextsMock.mockRejectedValue(new Error("model missing"));
    await expect(embedPoolBacklog()).resolves.toBeUndefined();
    expect(recordAiFailureMock).toHaveBeenCalledWith("discovery", expect.any(Error));
  });

  it("does nothing when every pooled card already has a vector", async () => {
    await embedPoolBacklog();
    expect(embedTextsMock).not.toHaveBeenCalled();
  });
});
