/**
 * Purpose: unit tests for ensureTermMarks — cache-hit short-circuit (no LLM call, no re-meter),
 * switch/apiConfig gating, prompt-list assembly from mastery/lookup evidence, density clipping
 * end-to-end, and silent failure (mocks db repos, settings, chatJson, metering, failure log).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

interface FakeTermMarkRow {
  id: string;
  target_kind: "message" | "focus_node";
  target_id: string;
  terms_json: string;
  created_at: string;
}

let termMarkRows: FakeTermMarkRow[] = [];
const termMarksGetByTargetMock = vi.fn(
  async (targetKind: string, targetId: string) =>
    termMarkRows.find((row) => row.target_kind === targetKind && row.target_id === targetId) ??
    null,
);
const termMarksInsertMock = vi.fn(async (row: FakeTermMarkRow) => {
  termMarkRows.push(row);
});

const knowledgeNodesListAllMock = vi.fn();
const nodeSightingsListAllMock = vi.fn();
const masteryClaimsListAllMock = vi.fn();
const focusNodesListDistinctWordLabelsMock = vi.fn();

vi.mock("../platform/db", () => ({
  getRepos: vi.fn(async () => ({
    termMarks: { getByTarget: termMarksGetByTargetMock, insert: termMarksInsertMock },
    knowledgeNodes: { listAll: knowledgeNodesListAllMock },
    nodeSightings: { listAll: nodeSightingsListAllMock },
    masteryClaims: { listAll: masteryClaimsListAllMock },
    focusNodes: { listDistinctWordLabels: focusNodesListDistinctWordLabelsMock },
  })),
}));

const apiConfig = { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m" };
let settingsState = {
  featureSwitches: { termMarking: true },
  networkEnabled: true,
  apiConfig: apiConfig as typeof apiConfig | null,
};
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settingsState },
}));

const recordAiFailureMock = vi.fn();
vi.mock("../platform/failureLog", () => ({
  degradeSilently: vi.fn(),
  recordAiFailure: recordAiFailureMock,
}));

const recordMeteredCallMock = vi.fn();
const recordFailedCallUsageMock = vi.fn();
vi.mock("../billing/metering", () => ({
  recordMeteredCall: recordMeteredCallMock,
  recordFailedCallUsage: recordFailedCallUsageMock,
}));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const { ensureTermMarks } = await import("./termMarking");

afterEach(() => {
  termMarkRows = [];
  termMarksGetByTargetMock.mockClear();
  termMarksInsertMock.mockClear();
  knowledgeNodesListAllMock.mockReset();
  nodeSightingsListAllMock.mockReset();
  masteryClaimsListAllMock.mockReset();
  focusNodesListDistinctWordLabelsMock.mockReset();
  recordAiFailureMock.mockReset();
  recordMeteredCallMock.mockReset();
  recordFailedCallUsageMock.mockReset();
  chatJsonMock.mockReset();
  settingsState = {
    featureSwitches: { termMarking: true },
    networkEnabled: true,
    apiConfig,
  };
});

describe("ensureTermMarks", () => {
  it("returns [] and never calls the LLM when the switch is off", async () => {
    settingsState.featureSwitches.termMarking = false;
    const result = await ensureTermMarks("message", "m1", "闭包是一个概念。", "c1");
    expect(result).toEqual([]);
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("returns [] and never calls the LLM when there is no API config", async () => {
    settingsState.apiConfig = null;
    const result = await ensureTermMarks("message", "m1", "闭包是一个概念。", "c1");
    expect(result).toEqual([]);
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("returns [] for a blank answer without calling the LLM", async () => {
    const result = await ensureTermMarks("message", "m1", "   ", "c1");
    expect(result).toEqual([]);
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("computes terms on a first call, meters, clips by density, and caches", async () => {
    knowledgeNodesListAllMock.mockResolvedValue([
      { id: "a", label: "作用域", summary: "", parent_id: null, kind: "concept", created_at: "t" },
    ]);
    nodeSightingsListAllMock.mockResolvedValue([
      {
        id: "s1",
        node_id: "a",
        conversation_id: "c1",
        message_id: null,
        created_at: new Date().toISOString(),
        origin_node_id: null,
        // A graded guess, not a passing mention: mastery caps a node the learner was never
        // observed retrieving below the lit tier, so a bare exposure would never make this list.
        grade: "easy",
      },
    ]);
    masteryClaimsListAllMock.mockResolvedValue([]);
    focusNodesListDistinctWordLabelsMock.mockResolvedValue(["闭包"]);
    chatJsonMock.mockResolvedValueOnce({
      parsed: { terms: [{ term: "尾递归" }, { term: "词法环境" }] },
      usage: { inputTokens: 50, outputTokens: 10 },
    });

    // "作用域" was freshly recalled on demand -> mastery ~1 (lit), so it lands on the lit list; thin
    // evidence (well under the threshold) -> density clip applies. Answer is 60 chars ->
    // cap = ceil(60/60) = 1, so only the first (highest-obstruction) term survives.
    const answer = "尾".repeat(60);
    const result = await ensureTermMarks("message", "m1", answer, "c1");

    expect(result).toEqual(["尾递归"]);
    expect(chatJsonMock).toHaveBeenCalledTimes(1);
    const [, messages] = chatJsonMock.mock.calls[0] as [unknown, { content: string }[]];
    expect(messages[1]?.content).toContain("作用域"); // lit list
    expect(messages[1]?.content).toContain("闭包"); // looked-up list
    expect(recordMeteredCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "term-marking", conversationId: "c1", model: "m" }),
    );
    expect(termMarksInsertMock).toHaveBeenCalledTimes(1);
  });

  it("does not clip once evidence clears the threshold", async () => {
    const manySightings = Array.from({ length: 30 }, (_, index) => ({
      id: `s${index}`,
      node_id: `n${index}`,
      conversation_id: "c1",
      message_id: null,
      created_at: new Date().toISOString(),
      origin_node_id: null,
    }));
    knowledgeNodesListAllMock.mockResolvedValue([]);
    nodeSightingsListAllMock.mockResolvedValue(manySightings);
    masteryClaimsListAllMock.mockResolvedValue([]);
    focusNodesListDistinctWordLabelsMock.mockResolvedValue([]);
    chatJsonMock.mockResolvedValueOnce({
      parsed: { terms: [{ term: "尾递归" }, { term: "词法环境" }] },
      usage: { inputTokens: 50, outputTokens: 10 },
    });

    const answer = "尾递归和词法环境都在这句话里。";
    const result = await ensureTermMarks("message", "m2", answer, "c1");
    expect(result).toEqual(["尾递归", "词法环境"]);
  });

  it("reuses the cached verdict on a second call and never calls the LLM again", async () => {
    knowledgeNodesListAllMock.mockResolvedValue([]);
    nodeSightingsListAllMock.mockResolvedValue([]);
    masteryClaimsListAllMock.mockResolvedValue([]);
    focusNodesListDistinctWordLabelsMock.mockResolvedValue([]);
    chatJsonMock.mockResolvedValueOnce({
      parsed: { terms: [{ term: "闭包" }] },
      usage: { inputTokens: 10, outputTokens: 2 },
    });

    const first = await ensureTermMarks("message", "m3", "闭包是核心。", "c1");
    const second = await ensureTermMarks("message", "m3", "闭包是核心。", "c1");

    expect(first).toEqual(["闭包"]);
    expect(second).toEqual(["闭包"]);
    expect(chatJsonMock).toHaveBeenCalledTimes(1);
    expect(recordMeteredCallMock).toHaveBeenCalledTimes(1);
  });

  it("returns [] and records a failure when the LLM call throws, without caching", async () => {
    knowledgeNodesListAllMock.mockResolvedValue([]);
    nodeSightingsListAllMock.mockResolvedValue([]);
    masteryClaimsListAllMock.mockResolvedValue([]);
    focusNodesListDistinctWordLabelsMock.mockResolvedValue([]);
    chatJsonMock.mockRejectedValueOnce(new Error("network blip"));

    const result = await ensureTermMarks("message", "m4", "闭包是核心。", "c1");
    expect(result).toEqual([]);
    expect(recordAiFailureMock).toHaveBeenCalledWith("term-marking", expect.any(Error));
    expect(termMarksInsertMock).not.toHaveBeenCalled();
  });
});
