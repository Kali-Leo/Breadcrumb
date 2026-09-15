/**
 * Purpose: the one decision this wiring makes that the pure layer cannot — whether this round
 * fetches sources at all, and from where. A follow-up on the same topic must reuse what is
 * already in the prompt (no requests, no seconds), a question that moved must fetch again,
 * the reader's own library comes before any network source and is read with the network
 * switch off, and a round with no source anywhere must degrade to teaching without a source
 * block rather than failing.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const settings = { networkEnabled: true };
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settings },
}));

let providers: { name: string }[] = [{ name: "wikipedia" }];
vi.mock("./evidenceProviders", () => ({
  currentEvidenceProviders: () => providers,
}));

const gatherEvidenceMock = vi.fn();
vi.mock("@breadcrumb/feature-factcheck", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@breadcrumb/feature-factcheck")>()),
  gatherTopicEvidence: (...args: unknown[]) => gatherEvidenceMock(...args),
}));

const retrieveFromLibraryMock = vi.fn();
vi.mock("../library/libraryRetrieval", () => ({
  retrieveFromLibrary: (...args: unknown[]) => retrieveFromLibraryMock(...args),
}));

const embedTextsMock = vi.fn();
vi.mock("../platform/embeddings", () => ({
  embedTexts: (texts: readonly string[]) => embedTextsMock(texts),
}));

vi.mock("../platform/failureLog", () => ({ degradeSilently: vi.fn() }));

let linkedDocumentIds: string[] = [];
vi.mock("../platform/db", () => ({
  getRepos: async () => ({
    libraryCollections: { listLinkedDocumentIds: async () => linkedDocumentIds },
  }),
}));

const { useGroundingStore } = await import("../../stores/groundingStore");
const { openRoundMaterial, prepareRoundMaterial } = await import("./topicRetrieval");
const { initI18n } = await import("../../i18n");

beforeAll(async () => {
  await initI18n();
});

const CONVERSATION = "conversation-1";

function evidence(index: number) {
  return {
    url: `https://example.org/${index}`,
    title: `标题${index}`,
    snippet: `珠穆朗玛峰的高度为 8848.86 米。珠穆朗玛峰资料第 ${index} 段。`,
    source: "wikipedia",
  };
}

function ownPassage(index: number) {
  return {
    id: `passage-${index}`,
    documentId: "doc-1",
    headingPath: `《测量史》 → 第一章 → 第 ${index} 节`,
    body: `珠穆朗玛峰的岩面高度为 8844.43 米。资料第 ${index} 节。`,
  };
}

/** Unit vectors whose cosine is exactly `Math.cos(angle)` against [1, 0, 0]. */
function atAngle(angle: number): number[] {
  return [Math.cos(angle), Math.sin(angle), 0];
}
const ON_TOPIC = atAngle(Math.acos(0.95));
const OFF_TOPIC = atAngle(Math.acos(0.3));

beforeEach(() => {
  providers = [{ name: "wikipedia" }];
  linkedDocumentIds = [];
  settings.networkEnabled = true;
  gatherEvidenceMock.mockReset();
  retrieveFromLibraryMock.mockReset();
  retrieveFromLibraryMock.mockResolvedValue([]);
  embedTextsMock.mockReset();
  useGroundingStore.setState({
    materialByConversation: new Map(),
    gatheringConversationIds: new Set(),
    annotationByMessage: new Map(),
  });
  gatherEvidenceMock.mockResolvedValue([evidence(1), evidence(2)]);
  embedTextsMock.mockImplementation(async (texts: readonly string[]) =>
    texts.map(() => atAngle(0)),
  );
});

describe("prepareRoundMaterial", () => {
  it("fetches on the first question of a topic", async () => {
    const material = await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(gatherEvidenceMock).toHaveBeenCalledTimes(1);
    expect(material?.passages).toHaveLength(2);
  });

  it("asks the searches topicQueries derived, not the raw question", async () => {
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高，是怎么测出来的");
    expect(gatherEvidenceMock).toHaveBeenCalledWith(
      expect.anything(),
      ["珠穆朗玛峰有多高", "珠穆朗玛峰有多高 是怎么测出来的"],
      8,
    );
  });

  it("reuses the passages when the follow-up is about the same topic", async () => {
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    embedTextsMock.mockResolvedValueOnce([ON_TOPIC]);
    const again = await prepareRoundMaterial(CONVERSATION, "那测量误差有多大");
    expect(gatherEvidenceMock).toHaveBeenCalledTimes(1);
    expect(again?.passages).toHaveLength(2);
  });

  it("fetches again once the question has moved off the topic", async () => {
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    embedTextsMock.mockResolvedValueOnce([OFF_TOPIC]);
    await prepareRoundMaterial(CONVERSATION, "光合作用是怎么回事");
    expect(gatherEvidenceMock).toHaveBeenCalledTimes(2);
  });

  it("re-fetches rather than guessing when there is no embedder", async () => {
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    embedTextsMock.mockResolvedValueOnce(null);
    await prepareRoundMaterial(CONVERSATION, "那测量误差有多大");
    expect(gatherEvidenceMock).toHaveBeenCalledTimes(2);
  });

  it("reads the library but no provider while the network switch is off", async () => {
    settings.networkEnabled = false;
    retrieveFromLibraryMock.mockResolvedValue([ownPassage(1)]);
    const material = await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(material?.passages.map((passage) => passage.source)).toEqual(["library"]);
    expect(gatherEvidenceMock).not.toHaveBeenCalled();
  });

  it("searches the linked documents first, and the whole library only when they are silent", async () => {
    linkedDocumentIds = ["doc-1", "doc-2"];
    retrieveFromLibraryMock.mockResolvedValueOnce([ownPassage(1)]);
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(retrieveFromLibraryMock).toHaveBeenCalledTimes(1);
    expect(retrieveFromLibraryMock.mock.calls[0]?.[2]).toMatchObject({
      documentIds: ["doc-1", "doc-2"],
    });

    retrieveFromLibraryMock.mockReset();
    retrieveFromLibraryMock.mockResolvedValue([]);
    embedTextsMock.mockResolvedValueOnce([OFF_TOPIC]);
    await prepareRoundMaterial(CONVERSATION, "光合作用是怎么回事");
    expect(retrieveFromLibraryMock).toHaveBeenCalledTimes(2);
    expect(retrieveFromLibraryMock.mock.calls[1]?.[2]).not.toHaveProperty("documentIds");
  });

  it("degrades to no material when the library is empty and no source is reachable", async () => {
    providers = [];
    expect(await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高")).toBeNull();
    expect(gatherEvidenceMock).not.toHaveBeenCalled();
  });

  it("shows the gathering state while it runs and clears it afterwards", async () => {
    let sawGathering = false;
    gatherEvidenceMock.mockImplementation(async () => {
      sawGathering = useGroundingStore.getState().gatheringConversationIds.has(CONVERSATION);
      return [evidence(1)];
    });
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(sawGathering).toBe(true);
    expect(useGroundingStore.getState().gatheringConversationIds.has(CONVERSATION)).toBe(false);
  });

  it("clears the gathering state even when the search throws", async () => {
    gatherEvidenceMock.mockRejectedValue(new Error("network"));
    expect(await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高")).toBeNull();
    expect(useGroundingStore.getState().gatheringConversationIds.has(CONVERSATION)).toBe(false);
  });
});

describe("openRoundMaterial", () => {
  it("opens the prompt with one numbered source block", async () => {
    const { messages, passages } = await openRoundMaterial({
      isChatRound: true,
      studyMode: true,
      conversationId: CONVERSATION,
      question: "珠穆朗玛峰有多高",
    });
    expect(passages).toHaveLength(2);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain("[1] wikipedia · ");
  });

  it("carries nothing on a round that is not a 学习模式 chat round", async () => {
    for (const round of [
      { isChatRound: false, studyMode: true },
      { isChatRound: true, studyMode: false },
    ]) {
      const result = await openRoundMaterial({
        ...round,
        conversationId: CONVERSATION,
        question: "珠穆朗玛峰有多高",
      });
      expect(result.messages).toEqual([]);
    }
    expect(gatherEvidenceMock).not.toHaveBeenCalled();
  });
});

describe("an elliptical follow-up", () => {
  it("is compared and searched with the topic's own words in front of it", async () => {
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    // Same topic only because the paste put 珠穆朗玛峰 back into a question that had none:
    // the bare 「那它有多高」 is off-topic to any vector comparison with these passages.
    const embedded: string[] = [];
    embedTextsMock.mockImplementation(async (texts: readonly string[]) => {
      embedded.push(...texts);
      return texts.map(() => atAngle(0));
    });
    await prepareRoundMaterial(CONVERSATION, "那它有多高");
    expect(embedded[0]?.startsWith("珠穆朗玛峰 ")).toBe(true);
    expect(embedded[0]?.endsWith(" 那它有多高")).toBe(true);
    expect(gatherEvidenceMock).toHaveBeenCalledTimes(1);
  });

  it("retrieves the topic's passages when there was nothing in hand to reuse", async () => {
    gatherEvidenceMock.mockResolvedValueOnce([]);
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    // Nothing was stored, so the next round starts from scratch and asks the raw question.
    embedTextsMock.mockResolvedValueOnce([ON_TOPIC]);
    const material = await prepareRoundMaterial(CONVERSATION, "那它有多高");
    expect(material?.passages.length).toBeGreaterThan(0);
  });

  it("does not paste the old topic's words onto a genuinely new subject", async () => {
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    embedTextsMock.mockResolvedValueOnce([OFF_TOPIC]);
    await prepareRoundMaterial(CONVERSATION, "光合作用是怎么回事");
    expect(gatherEvidenceMock).toHaveBeenLastCalledWith(
      expect.anything(),
      ["光合作用是怎么回事"],
      8,
    );
  });
});

describe("the reader's own library", () => {
  it("is searched first and its passages lead the material", async () => {
    retrieveFromLibraryMock.mockResolvedValue([ownPassage(1), ownPassage(2)]);
    const material = await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(retrieveFromLibraryMock).toHaveBeenCalledWith("珠穆朗玛峰有多高", expect.any(String), {
      topK: 8,
      rerank: true,
      onlyRelevant: true,
    });
    // Attention order: rank 1 opens the block, rank 2 closes it; the network fills between.
    const sources = material?.passages.map((passage) => passage.source);
    expect(sources?.[0]).toBe("library");
    expect(sources?.at(-1)).toBe("library");
    expect(sources).toHaveLength(4);
    expect(material?.passages[0]).toMatchObject({
      title: "《测量史》 → 第一章 → 第 1 节",
      url: "library:passage-1",
      text: "珠穆朗玛峰的岩面高度为 8844.43 米。资料第 1 节。",
    });
  });

  it("asks the network only for what the library left of the budget", async () => {
    retrieveFromLibraryMock.mockResolvedValue([1, 2, 3, 4, 5].map(ownPassage));
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(gatherEvidenceMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), 3);
  });

  it("sends no request at all when the library fills the budget", async () => {
    retrieveFromLibraryMock.mockResolvedValue([1, 2, 3, 4, 5, 6, 7, 8].map(ownPassage));
    const material = await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(gatherEvidenceMock).not.toHaveBeenCalled();
    expect(material?.passages).toHaveLength(8);
  });

  it("spends the reranker on a new subject and not on a same-topic re-ask", async () => {
    gatherEvidenceMock.mockResolvedValueOnce([]);
    await prepareRoundMaterial(CONVERSATION, "珠穆朗玛峰有多高");
    expect(retrieveFromLibraryMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ rerank: true }),
    );
    // Nothing was held, so the same-topic follow-up retrieves again — without the reranker.
    useGroundingStore.getState().setMaterial(CONVERSATION, {
      question: "珠穆朗玛峰有多高",
      passages: [],
      entities: ["珠穆朗玛峰"],
      vectors: [atAngle(0)],
    });
    embedTextsMock.mockResolvedValueOnce([ON_TOPIC]);
    await prepareRoundMaterial(CONVERSATION, "那它有多高");
    expect(retrieveFromLibraryMock).toHaveBeenLastCalledWith(
      "珠穆朗玛峰 那它有多高",
      expect.anything(),
      expect.objectContaining({ rerank: false }),
    );
  });
});
