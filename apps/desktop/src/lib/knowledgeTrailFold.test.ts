/**
 * Purpose: unit tests for foldExtractionIntoTrailState — a round's sightings land in its own
 * conversation's layer, and the mirror/fresh highlights only follow the viewed conversation
 * (the audit's cross-conversation highlight leak).
 */
import { describe, expect, it } from "vitest";
import { foldExtractionIntoTrailState, type TrailStateSlice } from "./knowledgeTrailFold";

function stateWith(overrides: Partial<TrailStateSlice>): TrailStateSlice {
  return {
    sessionNodeIds: [],
    trailByConversation: new Map(),
    freshNodeIds: new Set(),
    ...overrides,
  };
}

describe("foldExtractionIntoTrailState", () => {
  it("appends unique sighted ids to the round's layer and the mirror while viewing it", () => {
    const state = stateWith({
      sessionNodeIds: ["n1"],
      trailByConversation: new Map([["c1", ["n1"]]]),
    });
    const next = foldExtractionIntoTrailState(state, {
      conversationId: "c1",
      isViewingThisConversation: true,
      sightedNodeIds: ["n1", "n2"],
      freshNodeIds: ["n2"],
    });
    expect(next.trailByConversation.get("c1")).toEqual(["n1", "n2"]);
    expect(next.sessionNodeIds).toEqual(["n1", "n2"]);
    expect([...next.freshNodeIds]).toEqual(["n2"]);
  });

  it("a background round updates its own layer but never the mirror or fresh highlights", () => {
    const state = stateWith({
      sessionNodeIds: ["viewed-node"],
      trailByConversation: new Map([
        ["viewed", ["viewed-node"]],
        ["background", ["old"]],
      ]),
      freshNodeIds: new Set(["viewed-fresh"]),
    });
    const next = foldExtractionIntoTrailState(state, {
      conversationId: "background",
      isViewingThisConversation: false,
      sightedNodeIds: ["new"],
      freshNodeIds: ["new"],
    });
    expect(next.trailByConversation.get("background")).toEqual(["old", "new"]);
    expect(next.sessionNodeIds).toEqual(["viewed-node"]);
    expect(next.freshNodeIds).toBe(state.freshNodeIds);
  });

  it("never creates a partial layer for a conversation whose fill never ran", () => {
    const state = stateWith({ freshNodeIds: new Set(["keep"]) });
    const next = foldExtractionIntoTrailState(state, {
      conversationId: "never-visited",
      isViewingThisConversation: false,
      sightedNodeIds: ["n1"],
      freshNodeIds: ["n1"],
    });
    expect(next.trailByConversation.has("never-visited")).toBe(false);
    expect(next.freshNodeIds).toBe(state.freshNodeIds);
  });

  it("while viewing a conversation whose layer is still loading, only the mirror grows", () => {
    const state = stateWith({ sessionNodeIds: ["n1"] });
    const next = foldExtractionIntoTrailState(state, {
      conversationId: "c1",
      isViewingThisConversation: true,
      sightedNodeIds: ["n2"],
      freshNodeIds: ["n2"],
    });
    expect(next.trailByConversation.has("c1")).toBe(false);
    expect(next.sessionNodeIds).toEqual(["n1", "n2"]);
    expect([...next.freshNodeIds]).toEqual(["n2"]);
  });
});
