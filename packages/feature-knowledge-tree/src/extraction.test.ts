/**
 * Purpose: unit tests for the knowledge-tree extraction prompt builder — in particular that
 * the existing-tree rendering no longer uses the "（父：根）" wording the model was echoing
 * back verbatim as a bogus parentLabel value (P7).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildExtractionMessages } from "./extraction";

function node(id: string, label: string, parentId: string | null): KnowledgeNodeRow {
  return {
    id,
    parent_id: parentId,
    label,
    summary: "s",
    kind: "concept",
    created_at: "2026-08-01T00:00:00Z",
  };
}

describe("buildExtractionMessages", () => {
  it("renders a top-level node as （顶层）, never （父：根）", () => {
    const messages = buildExtractionMessages([node("n1", "JavaScript", null)], "q", "a");
    const treeText = messages[1]?.content ?? "";
    expect(treeText).toContain("JavaScript（顶层）");
    expect(treeText).not.toContain("父：根");
  });

  it("renders a nested node with its real parent label", () => {
    const messages = buildExtractionMessages(
      [node("n1", "JavaScript", null), node("n2", "闭包", "n1")],
      "q",
      "a",
    );
    const treeText = messages[1]?.content ?? "";
    expect(treeText).toContain("闭包（父：JavaScript）");
  });

  it("instructs that parentLabel must be an existing label or null, never descriptive text", () => {
    const messages = buildExtractionMessages([node("n1", "JavaScript", null)], "q", "a");
    const systemContent = messages[0]?.content ?? "";
    expect(systemContent).not.toContain("父：根");
    expect(systemContent).toContain("null");
  });
});
