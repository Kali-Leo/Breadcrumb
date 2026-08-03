/**
 * Purpose: unit tests for propagateInterestToPrerequisites — threshold gating, the 0.5
 * inherit factor, one-hop-only reach, max-not-stacked across multiple sources, and the
 * unlit/lit guards on both ends of the requires edge.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  PROPAGATION_INHERIT_FACTOR,
  PROPAGATION_INTEREST_THRESHOLD,
  propagateInterestToPrerequisites,
} from "./propagate";

let edgeCounter = 0;
function requires(source: string, target: string): KnowledgeEdgeRow {
  edgeCounter += 1;
  return {
    id: `e${edgeCounter}`,
    source_id: source,
    target_id: target,
    edge_type: "requires",
    weight: 1,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}
function helps(source: string, target: string): KnowledgeEdgeRow {
  edgeCounter += 1;
  return {
    id: `e${edgeCounter}`,
    source_id: source,
    target_id: target,
    edge_type: "helps",
    weight: 0.5,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}

const LIT = 0.85;

describe("propagateInterestToPrerequisites", () => {
  it("lends an unlit interested node's interest x factor to its unlit prerequisite", () => {
    // p --requires--> x, x is unlit and interested, p is unlit.
    const edges = [requires("p", "x")];
    const result = propagateInterestToPrerequisites(
      edges,
      new Map([["x", 0.8]]),
      new Map([
        ["p", 0],
        ["x", 0],
      ]),
      LIT,
    );
    expect(result.interestByNode.get("p")).toBeCloseTo(0.8 * PROPAGATION_INHERIT_FACTOR, 5);
    expect(result.gatewaySourceByNode.get("p")).toBe("x");
  });

  it("does not propagate when the dependent's interest is below the threshold", () => {
    const edges = [requires("p", "x")];
    const result = propagateInterestToPrerequisites(
      edges,
      new Map([["x", PROPAGATION_INTEREST_THRESHOLD - 0.01]]),
      new Map(),
      LIT,
    );
    expect(result.interestByNode.get("p") ?? 0).toBe(0);
    expect(result.gatewaySourceByNode.has("p")).toBe(false);
  });

  it("does not propagate onto an already-lit prerequisite", () => {
    const edges = [requires("p", "x")];
    const result = propagateInterestToPrerequisites(
      edges,
      new Map([
        ["x", 0.9],
        ["p", 0.1],
      ]),
      new Map([["p", 0.95]]),
      LIT,
    );
    // p is lit — its own (unrelated) interest score passes through untouched.
    expect(result.interestByNode.get("p")).toBe(0.1);
    expect(result.gatewaySourceByNode.has("p")).toBe(false);
  });

  it("does not propagate from an already-lit dependent (it's not locked, nothing to route around)", () => {
    const edges = [requires("p", "x")];
    const result = propagateInterestToPrerequisites(
      edges,
      new Map([["x", 0.9]]),
      new Map([["x", 0.95]]),
      LIT,
    );
    expect(result.interestByNode.get("p") ?? 0).toBe(0);
    expect(result.gatewaySourceByNode.has("p")).toBe(false);
  });

  it("keeps the prerequisite's own higher interest instead of overwriting with a lower inherited value", () => {
    const edges = [requires("p", "x")];
    const result = propagateInterestToPrerequisites(
      edges,
      new Map([
        ["x", 0.4],
        ["p", 0.7],
      ]),
      new Map(),
      LIT,
    );
    // inherited = 0.4 * 0.5 = 0.2, which is less than p's own 0.7 — no change, no gateway.
    expect(result.interestByNode.get("p")).toBe(0.7);
    expect(result.gatewaySourceByNode.has("p")).toBe(false);
  });

  it("takes the max across multiple qualifying dependents instead of stacking", () => {
    // both p1 and p2 require the shared prerequisite "shared"
    const edges = [requires("shared", "p1"), requires("shared", "p2")];
    const result = propagateInterestToPrerequisites(
      edges,
      new Map([
        ["p1", 0.4],
        ["p2", 0.9],
      ]),
      new Map(),
      LIT,
    );
    expect(result.interestByNode.get("shared")).toBeCloseTo(0.9 * PROPAGATION_INHERIT_FACTOR, 5);
    expect(result.gatewaySourceByNode.get("shared")).toBe("p2");
  });

  it("only reaches one hop — a prerequisite's own prerequisite never inherits", () => {
    // grandparent --requires--> parent --requires--> child(interested, unlit)
    const edges = [requires("grandparent", "parent"), requires("parent", "child")];
    const result = propagateInterestToPrerequisites(
      edges,
      new Map([["child", 0.9]]),
      new Map(),
      LIT,
    );
    expect(result.interestByNode.get("parent")).toBeCloseTo(0.9 * PROPAGATION_INHERIT_FACTOR, 5);
    expect(result.interestByNode.get("grandparent") ?? 0).toBe(0);
  });

  it("ignores helps edges — propagation only travels along requires", () => {
    const edges = [helps("p", "x")];
    const result = propagateInterestToPrerequisites(edges, new Map([["x", 0.9]]), new Map(), LIT);
    expect(result.interestByNode.get("p") ?? 0).toBe(0);
  });

  it("passes every input node's own interest through untouched when nothing qualifies", () => {
    const result = propagateInterestToPrerequisites([], new Map([["a", 0.5]]), new Map(), LIT);
    expect(result.interestByNode.get("a")).toBe(0.5);
    expect(result.gatewaySourceByNode.size).toBe(0);
  });
});
