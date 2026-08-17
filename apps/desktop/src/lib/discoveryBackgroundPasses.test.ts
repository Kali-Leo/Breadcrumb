/**
 * Purpose: unit tests for the passes that run behind the feed — the quality check's scores are
 * written to the cards it rated and nowhere else, an unrated card is left unrated rather than
 * marked bad, and the embedding pass fills in whatever the pool is still missing without ever
 * failing the round.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

let missingEmbedding: DiscoveryCardRow[] = [];
const setCardQualityScoreMock = vi.fn(async () => {});
const setCardEmbeddingMock = vi.fn(async () => {});

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      listCardsMissingEmbedding: async (limit: number) => missingEmbedding.slice(0, limit),
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

const { embedPoolBacklog, scoreLandedBatch } = await import("./discoveryBackgroundPasses");

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
  setCardQualityScoreMock.mockClear();
  setCardEmbeddingMock.mockClear();
  scoreBatchQualityMock.mockReset();
  embedTextsMock.mockReset();
  recordAiFailureMock.mockReset();
});

describe("scoreLandedBatch", () => {
  it("writes a score for every card the check actually rated", async () => {
    scoreBatchQualityMock.mockResolvedValue(new Map([["a", 0.2]]));
    await scoreLandedBatch([card("a"), card("b")]);
    expect(setCardQualityScoreMock).toHaveBeenCalledTimes(1);
    expect(setCardQualityScoreMock).toHaveBeenCalledWith("a", 0.2);
  });

  it("leaves a card the check skipped unrated instead of guessing at it", async () => {
    scoreBatchQualityMock.mockResolvedValue(new Map());
    await scoreLandedBatch([card("a")]);
    expect(setCardQualityScoreMock).not.toHaveBeenCalled();
  });

  it("never asks twice about a card that already has a score", async () => {
    await scoreLandedBatch([card("a", { quality_score: 0.9 })]);
    expect(scoreBatchQualityMock).not.toHaveBeenCalled();
  });

  it("costs nothing at all when the round landed nothing", async () => {
    await scoreLandedBatch([]);
    expect(scoreBatchQualityMock).not.toHaveBeenCalled();
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
