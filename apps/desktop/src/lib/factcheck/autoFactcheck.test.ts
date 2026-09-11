/**
 * Purpose: the policy around the automatic fact check — what has to be true before we spend
 * someone's request quota on an answer they never asked us to check, that an answer is only
 * ever attempted once, and that a run of failures (a spent daily quota looks exactly like one)
 * stands the automatic runs down instead of printing an error under every further answer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const studyModeForMock = vi.fn();
vi.mock("../../stores/chatStore", () => ({
  appEventBus: { on: vi.fn(() => () => {}) },
  useChatStore: { getState: () => ({ studyModeFor: studyModeForMock }) },
}));

const checkMessageMock = vi.fn();
const noteAutoPausedMock = vi.fn();
let claimsByConversation = new Map<string, Map<string, unknown[]>>();
vi.mock("../../stores/factcheckStore", () => ({
  useFactcheckStore: {
    getState: () => ({
      claimsByConversation,
      checkMessage: checkMessageMock,
      noteAutoPaused: noteAutoPausedMock,
    }),
  },
}));

const settings = {
  featureSwitches: { factcheck: true, factcheckAuto: true },
  networkEnabled: true,
  apiConfig: { model: "test-model" },
};
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settings },
}));

const { autoCheckFinishedRound, resetAutoFactcheckState, shouldAutoCheck } = await import(
  "./autoFactcheck"
);

/** Everything permitting the run; each test turns off the one thing it is about. */
const ALLOWED = {
  factcheckEnabled: true,
  autoEnabled: true,
  studyMode: true,
  networkEnabled: true,
  hasApiConfig: true,
  alreadyChecked: false,
  alreadyAttempted: false,
  paused: false,
};

/** Makes the next checkMessage land a claim list, the way a completed run does. */
function landOn(conversationId: string, messageId: string): void {
  checkMessageMock.mockImplementationOnce(() => {
    claimsByConversation.set(conversationId, new Map([[messageId, []]]));
    return Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  claimsByConversation = new Map();
  checkMessageMock.mockResolvedValue(undefined);
  studyModeForMock.mockReturnValue(true);
  settings.featureSwitches = { factcheck: true, factcheckAuto: true };
  resetAutoFactcheckState();
});

describe("shouldAutoCheck", () => {
  it("runs when everything is in place", () => {
    expect(shouldAutoCheck(ALLOWED)).toBe(true);
  });

  it.each([
    ["the feature is switched off", { factcheckEnabled: false }],
    ["only the automatic run is switched off", { autoEnabled: false }],
    ["the round was not a study-mode round", { studyMode: false }],
    ["the network switch is off", { networkEnabled: false }],
    ["no AI service is configured", { hasApiConfig: false }],
    ["this answer already has a check", { alreadyChecked: true }],
    ["this answer was already attempted once", { alreadyAttempted: true }],
    ["the automatic runs stood down this session", { paused: true }],
  ])("stays out of it when %s", (_reason, override) => {
    expect(shouldAutoCheck({ ...ALLOWED, ...override })).toBe(false);
  });
});

describe("autoCheckFinishedRound", () => {
  it("checks a study-mode answer without being asked", async () => {
    landOn("c1", "m1");
    await autoCheckFinishedRound("c1", "m1");
    expect(checkMessageMock).toHaveBeenCalledWith("c1", "m1");
  });

  it("leaves a free-chat answer alone", async () => {
    studyModeForMock.mockReturnValue(false);
    await autoCheckFinishedRound("c1", "m1");
    expect(checkMessageMock).not.toHaveBeenCalled();
  });

  it("obeys the automatic-run switch on its own, with the feature still on", async () => {
    settings.featureSwitches = { factcheck: true, factcheckAuto: false };
    await autoCheckFinishedRound("c1", "m1");
    expect(checkMessageMock).not.toHaveBeenCalled();
  });

  it("never checks the same answer twice, even after that check failed", async () => {
    // A failed round is not retried behind the reader's back: the button is still there.
    await autoCheckFinishedRound("c1", "m1");
    await autoCheckFinishedRound("c1", "m1");
    expect(checkMessageMock).toHaveBeenCalledTimes(1);
  });

  it("stands down for the session after two failures in a row, and says so once", async () => {
    await autoCheckFinishedRound("c1", "m1");
    await autoCheckFinishedRound("c1", "m2");
    expect(noteAutoPausedMock).toHaveBeenCalledTimes(1);

    await autoCheckFinishedRound("c1", "m3");
    expect(checkMessageMock).toHaveBeenCalledTimes(2);
    expect(noteAutoPausedMock).toHaveBeenCalledTimes(1);
  });

  it("forgets earlier failures once a check gets through", async () => {
    await autoCheckFinishedRound("c1", "m1");
    landOn("c1", "m2");
    await autoCheckFinishedRound("c1", "m2");
    await autoCheckFinishedRound("c1", "m3");

    expect(noteAutoPausedMock).not.toHaveBeenCalled();
    expect(checkMessageMock).toHaveBeenCalledTimes(3);
  });
});
