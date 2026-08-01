/**
 * Purpose: unit tests for the interest-extraction prompt builder and its response schema.
 */
import { describe, expect, it } from "vitest";
import { buildInterestMessages, interestSignalsSchema } from "./extraction";

describe("buildInterestMessages", () => {
  it("echoes every given node's label into the prompt", () => {
    const messages = buildInterestMessages(
      [
        { nodeId: "n1", label: "闭包" },
        { nodeId: "n2", label: "递归" },
      ],
      "闭包是什么？",
      "闭包是……",
    );
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toContain("闭包");
    expect(messages[1]?.content).toContain("递归");
    expect(messages[1]?.content).toContain("闭包是什么？");
  });

  it("instructs the model to discriminate impatient/dismissive brevity from efficient engagement", () => {
    const messages = buildInterestMessages([{ nodeId: "n1", label: "闭包" }], "问", "答");
    const systemContent = messages[0]?.content ?? "";
    expect(systemContent).toContain("懂了懂了");
    expect(systemContent).toContain("别讲概念");
    expect(systemContent).toContain("直接来例子");
    expect(systemContent).toContain("行吧行吧");
    expect(systemContent).toContain("高效投入");
  });
});

describe("interestSignalsSchema", () => {
  it("accepts a well-formed response", () => {
    const result = interestSignalsSchema.parse({
      signals: [{ label: "闭包", curiosity: 0.8, confusion: 0.1, boredom: 0, styles: ["类比"] }],
    });
    expect(result.signals).toHaveLength(1);
  });

  it("accepts an empty signal list", () => {
    expect(interestSignalsSchema.parse({ signals: [] }).signals).toEqual([]);
  });

  it("rejects an out-of-range dimension", () => {
    expect(() =>
      interestSignalsSchema.parse({
        signals: [{ label: "闭包", curiosity: 1.5, confusion: 0, boredom: 0, styles: [] }],
      }),
    ).toThrow();
  });
});
