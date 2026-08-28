/**
 * Purpose: unit tests for gradeFocusGuess's evidence side — a graded guess is the only real
 * retrieval signal the app has, so all three outcomes must land as one sighting carrying the
 * matching FSRS grade, the wrong one included (design audit 2026-08-28, 掌握度评估 G2).
 * The learner-facing half is deliberately unaffected: wrong still reads the same as before.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const recordMock = vi.fn();
const getByNodeMock = vi.fn();
const embedTextsMock = vi.fn();

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    nodeSightings: { record: recordMock },
    nodeEmbeddings: { getByNode: getByNodeMock },
  })),
}));
vi.mock("./embeddings", () => ({ embedTexts: embedTextsMock }));
vi.mock("../stores/knowledgeStore", () => ({
  useKnowledgeStore: { getState: () => ({ nodes: [] }) },
}));

const { gradeFocusGuess } = await import("./focusGuessGrading");

afterEach(() => {
  recordMock.mockReset();
  getByNodeMock.mockReset();
  embedTextsMock.mockReset();
});

/** The node's stored embedding is the unit vector along x; a guess vector at angle θ from it
 * has cosine similarity cos θ, which is what gradeConceptGuess thresholds on. */
function nodeEmbedding(): { vector_json: string } {
  return { vector_json: JSON.stringify([1, 0]) };
}

async function guessWithSimilarity(cosine: number): Promise<void> {
  embedTextsMock.mockResolvedValueOnce([[cosine, Math.sqrt(Math.max(0, 1 - cosine * cosine))]]);
  getByNodeMock.mockResolvedValueOnce(nodeEmbedding());
  await gradeFocusGuess({
    nodeId: "n1",
    guess: "猜的词",
    summary: "概念摘要",
    conversationId: "c1",
    originNodeId: null,
  });
}

describe("gradeFocusGuess", () => {
  it("records a wrong guess as a failed retrieval instead of dropping it", async () => {
    await guessWithSimilarity(0.05);

    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({ node_id: "n1", grade: "again" });
  });

  it("keeps the wrong-guess wording unchanged — the negative signal is internal only", async () => {
    embedTextsMock.mockResolvedValueOnce([[0.05, 0.99]]);
    getByNodeMock.mockResolvedValueOnce(nodeEmbedding());
    const result = await gradeFocusGuess({
      nodeId: "n1",
      guess: "猜的词",
      summary: "概念摘要",
      conversationId: "c1",
      originNodeId: null,
    });
    expect(result.grade).toBe("wrong");
    expect(result.feedback).toBeDefined();
  });

  it("grades a correct guess as an easy retrieval and a close one as a hard retrieval", async () => {
    await guessWithSimilarity(0.95);
    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({ grade: "easy" });
    recordMock.mockReset();

    await guessWithSimilarity(0.84);
    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({ grade: "hard" });
  });

  it("records nothing when there is no embedding to grade against", async () => {
    embedTextsMock.mockResolvedValueOnce([[1, 0]]);
    getByNodeMock.mockResolvedValueOnce(null);
    const result = await gradeFocusGuess({
      nodeId: "n1",
      guess: "猜的词",
      summary: "概念摘要",
      conversationId: "c1",
      originNodeId: null,
    });
    expect(result.grade).toBeNull();
    expect(recordMock).not.toHaveBeenCalled();
  });
});
