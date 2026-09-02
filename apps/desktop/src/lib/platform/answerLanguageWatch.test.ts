/**
 * Purpose: the answer-language tripwire across a whole conversation — a reply in the wrong
 * language hardens the next round's instruction and lands in the silent-failure log; a
 * correct reply relaxes it again; a reply nobody can judge (too short, all code) changes
 * nothing. The point is that neither a wrong reply nor an unjudgeable one is ever silently
 * treated as fine.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({
  degradeSilently: vi.fn(),
  recordAiFailure: recordAiFailureMock,
}));

const answerLanguage = { code: "en", detectionCodes: ["eng"] };
vi.mock("./llmConfig", () => ({ currentAnswerLanguage: () => answerLanguage }));

const { forgetAnswerLanguageWatch, noteReplyLanguage, shouldUseFirmDirective } = await import(
  "./answerLanguageWatch"
);

const ENGLISH_REPLY =
  "A closure is a function together with the environment it captured, which is why it can still read those variables later on.";
const CHINESE_REPLY =
  "闭包是函数和它捕获的环境组成的整体，所以它能在离开定义位置之后继续读到那些变量。";

describe("answer-language watch", () => {
  beforeEach(() => {
    forgetAnswerLanguageWatch();
    recordAiFailureMock.mockClear();
  });

  it("walks a conversation that drifts, gets corrected, and drifts again", async () => {
    expect(shouldUseFirmDirective("c1")).toBe(false);

    expect(await noteReplyLanguage("c1", ENGLISH_REPLY)).toBe("matches");
    expect(shouldUseFirmDirective("c1")).toBe(false);
    expect(recordAiFailureMock).not.toHaveBeenCalled();

    expect(await noteReplyLanguage("c1", CHINESE_REPLY)).toBe("differs");
    expect(shouldUseFirmDirective("c1")).toBe(true);
    expect(recordAiFailureMock).toHaveBeenCalledTimes(1);

    // The harder instruction stays until a reply actually comes back right.
    expect(await noteReplyLanguage("c1", "```js\nconst a = 1;\n```")).toBe("unknown");
    expect(shouldUseFirmDirective("c1")).toBe(true);

    expect(await noteReplyLanguage("c1", ENGLISH_REPLY)).toBe("matches");
    expect(shouldUseFirmDirective("c1")).toBe(false);
  });

  it("keeps conversations apart", async () => {
    await noteReplyLanguage("c1", CHINESE_REPLY);
    expect(shouldUseFirmDirective("c1")).toBe(true);
    expect(shouldUseFirmDirective("c2")).toBe(false);
  });

  it("still judges a reply that belongs to no conversation, without blowing up", async () => {
    expect(await noteReplyLanguage(null, CHINESE_REPLY)).toBe("differs");
    expect(recordAiFailureMock).toHaveBeenCalledTimes(1);
    expect(shouldUseFirmDirective(null)).toBe(false);
  });

  it("records the language it wanted, so the log says what actually went wrong", async () => {
    await noteReplyLanguage("c1", CHINESE_REPLY);
    const [purpose, error] = recordAiFailureMock.mock.calls[0] as [string, Error];
    expect(purpose).toBe("chat");
    expect(error.message).toContain("en");
  });
});
