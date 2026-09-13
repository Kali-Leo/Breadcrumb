/**
 * Purpose: the follow-up rewrite, and the one thing it must not do — carry the previous
 * subject's words into a question about something else. Both halves are measured: pasting the
 * topic's heaviest words in front of an elliptical question recovers 92% of what ellipsis
 * costs, and the loss it recovers (−53% nDCG@10, −51% Recall@8) is loss no reranker can undo,
 * because the right passages never entered the pool.
 */
import { describe, expect, it } from "vitest";
import { createFollowUpRewriter, MAX_TOPIC_ENTITIES, prefixTopicEntities } from "./followUpRewrite";
import { createTopicTracker, TOPIC_OVERLAP_THRESHOLD } from "./topicDrift";

const ENTITIES = ["复利", "七二法则", "本金"];

describe("prefixTopicEntities", () => {
  it("puts the topic's words in front and leaves the question as written", () => {
    expect(prefixTopicEntities("那它有多高", ENTITIES)).toBe("复利 七二法则 那它有多高");
  });

  it("takes at most two, so the question is not outvoted by its own context", () => {
    expect(MAX_TOPIC_ENTITIES).toBe(2);
    expect(prefixTopicEntities("q", ENTITIES).split(" ")).toHaveLength(3);
  });

  it("pastes unconditionally rather than only when a word looks missing", () => {
    // The careful-looking version — paste only when the question lacks a heavy word —
    // measured 76% recovery against 92%. The condition is the thing that loses.
    expect(prefixTopicEntities("复利怎么算", ["复利"])).toBe("复利 复利怎么算");
  });

  it("has nothing to paste when the caller found no entities", () => {
    expect(prefixTopicEntities("那它有多高", [])).toBe("那它有多高");
    expect(prefixTopicEntities("那它有多高", ["", "  "])).toBe("那它有多高");
  });
});

describe("createFollowUpRewriter", () => {
  it("leaves the first question of a conversation alone", () => {
    expect(createFollowUpRewriter().rewriteFollowUp("复利是什么", ENTITIES)).toBe("复利是什么");
  });

  it("repairs a follow-up about the same subject", () => {
    const rewriter = createFollowUpRewriter();
    rewriter.rewriteFollowUp("复利的计算公式是什么", ENTITIES);
    expect(rewriter.rewriteFollowUp("复利的计算公式有例子吗", ENTITIES)).toBe(
      "复利 七二法则 复利的计算公式有例子吗",
    );
  });

  it("leaves a new subject exactly as the reader wrote it", () => {
    // On a genuine change of subject the previous topic's words are not context, they are
    // contamination — they would pull the whole pool back to the question before this one.
    const rewriter = createFollowUpRewriter();
    rewriter.rewriteFollowUp("复利的计算公式是什么", ENTITIES);
    expect(rewriter.rewriteFollowUp("光合作用需要哪些条件", ENTITIES)).toBe("光合作用需要哪些条件");
  });

  it("makes one judgement per turn, whichever decision asks first", () => {
    const first = createFollowUpRewriter();
    first.rewriteFollowUp("复利的计算公式是什么", ENTITIES);
    const question = "复利的计算公式有例子吗";
    // Asking twice about the same question must not compare it to itself.
    expect(first.shouldRerank(question)).toBe(false);
    expect(first.rewriteFollowUp(question, ENTITIES)).toContain("复利 七二法则");

    const second = createFollowUpRewriter();
    second.shouldRerank("复利的计算公式是什么");
    expect(second.rewriteFollowUp(question, ENTITIES)).toContain("复利 七二法则");
    expect(second.shouldRerank(question)).toBe(false);
  });

  it("reranks every turn where the reranker is nearly free, without changing the rewrite", () => {
    const rewriter = createFollowUpRewriter({ rerankEveryTurn: true });
    rewriter.rewriteFollowUp("复利的计算公式是什么", ENTITIES);
    const question = "复利的计算公式有例子吗";
    expect(rewriter.shouldRerank(question)).toBe(true);
    expect(rewriter.rewriteFollowUp(question, ENTITIES)).toContain("复利");
  });

  it("starts a new conversation from nothing", () => {
    const rewriter = createFollowUpRewriter();
    rewriter.rewriteFollowUp("复利是什么", ENTITIES);
    rewriter.reset();
    expect(rewriter.rewriteFollowUp("复利是什么", ENTITIES)).toBe("复利是什么");
  });
});

describe("createTopicTracker", () => {
  it("answers the same question the same way twice", () => {
    const tracker = createTopicTracker();
    tracker.observe("复利的计算公式是什么");
    expect(tracker.observe("复利的计算公式有例子吗")).toBe(true);
    expect(tracker.observe("复利的计算公式有例子吗")).toBe(true);
    expect(TOPIC_OVERLAP_THRESHOLD).toBeLessThan(0.5);
  });
});
