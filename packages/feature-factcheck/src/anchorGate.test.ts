/**
 * Purpose: unit tests for the mechanical anchor gate — what counts as a verbatim quote, what
 * normalising is allowed (whitespace, the prompt's own fences, NFC) and what is not (any
 * rewrite, however small), and the one behaviour the product depends on: a decided verdict
 * whose quote is not in the material comes back as `insufficient`.
 */
import { describe, expect, it } from "vitest";
import { foldEvidenceText, gateVerdict, MIN_ANCHOR_CHARS, quoteIsGrounded } from "./anchorGate";
import type { EvidenceItem } from "./evidence/provider";

const EVIDENCE: EvidenceItem[] = [
  {
    url: "https://zh.wikipedia.org/wiki/珠穆朗瑪峰",
    title: "珠穆朗瑪峰",
    snippet: "珠穆朗玛峰是喜马拉雅山脉的主峰，是世界第一高峰，\n海拔 8848.86 米。",
    source: "wikipedia",
  },
];

describe("foldEvidenceText", () => {
  it("folds every run of whitespace to one space and trims", () => {
    expect(foldEvidenceText("  a \n\t b  ")).toBe("a b");
  });

  it("strips the fence literals the prompt wraps excerpts in", () => {
    expect(foldEvidenceText("正文 <<<END 1>>> 更多")).toBe("正文 END 1 更多");
  });
});

describe("quoteIsGrounded", () => {
  it("accepts a verbatim quote, line breaks in the source notwithstanding", () => {
    expect(quoteIsGrounded("是世界第一高峰，\n海拔 8848.86 米", EVIDENCE)).toBe(true);
  });

  it("accepts a quote that differs from the source only in spacing", () => {
    // Measured against the real thing: asked to copy 「海拔8848.86米」 out of a wikipedia
    // summary, free models write 「海拔 8848.86 米」. That is typography, not fabrication, and
    // the run that landed this gate had a strict rule refusing correct verdicts over it —
    // 9 lost against 5, with no false support let through either way.
    expect(quoteIsGrounded("是世界第一高峰，海拔8848.86米", EVIDENCE)).toBe(true);
    // ...and the floor counts characters, not spaces: this is ten characters, not seventeen.
    expect(quoteIsGrounded("是 世 界 第 一 高 峰 ， 海 拔", EVIDENCE)).toBe(true);
  });

  it("rejects a quote that was reworded, however slightly", () => {
    // One character changed: this is the fabrication the gate exists to catch.
    expect(quoteIsGrounded("是世界第二高峰，海拔 8848.86 米", EVIDENCE)).toBe(false);
    // A number lifted onto the wrong subject reads plausibly and is still not in the text.
    expect(quoteIsGrounded("珠穆朗玛峰海拔 8844.43 米", EVIDENCE)).toBe(false);
  });

  it("rejects a quote too short to mean anything", () => {
    expect("海拔".length).toBeLessThan(MIN_ANCHOR_CHARS);
    expect(quoteIsGrounded("海拔", EVIDENCE)).toBe(false);
    expect(quoteIsGrounded("", EVIDENCE)).toBe(false);
  });

  it("rejects every quote when there is no evidence to check it against", () => {
    expect(quoteIsGrounded("是喜马拉雅山脉的主峰", [])).toBe(false);
  });
});

describe("gateVerdict", () => {
  it("lets a grounded verdict through unchanged", () => {
    expect(
      gateVerdict({ relationship: "supported", quote: "是喜马拉雅山脉的主峰" }, EVIDENCE),
    ).toEqual({
      relationship: "supported",
      downgraded: false,
    });
  });

  it("downgrades a decided verdict whose quote is not in the evidence", () => {
    for (const relationship of ["supported", "contradicted"] as const) {
      expect(gateVerdict({ relationship, quote: "海拔 8844.43 米" }, EVIDENCE)).toEqual({
        relationship: "insufficient",
        downgraded: true,
      });
    }
  });

  it("leaves an abstention alone — there is nothing to ground", () => {
    expect(gateVerdict({ relationship: "insufficient", quote: "" }, EVIDENCE)).toEqual({
      relationship: "insufficient",
      downgraded: false,
    });
  });
});
