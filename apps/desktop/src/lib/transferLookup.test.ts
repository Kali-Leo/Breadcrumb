/**
 * Purpose: unit tests for listOtherTrailsForNode — excludes the current conversation, dedupes
 * to each conversation's latest sighting, orders newest first, and caps at 5.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { listOtherTrailsForNode, MAX_TRANSFER_LISTINGS } from "./transferLookup";

function sighting(
  conversationId: string,
  nodeId: string,
  createdAt: string,
  messageId: string | null = null,
): NodeSightingRow {
  return {
    id: `s-${conversationId}-${createdAt}`,
    node_id: nodeId,
    conversation_id: conversationId,
    message_id: messageId,
    created_at: createdAt,
  };
}

describe("listOtherTrailsForNode", () => {
  it("excludes the current conversation", () => {
    const sightings = [sighting("current", "n1", "2026-08-13T10:00:00.000Z")];
    expect(listOtherTrailsForNode("n1", "current", sightings)).toEqual([]);
  });

  it("dedupes each other conversation to its own most recent sighting", () => {
    const sightings = [
      sighting("c2", "n1", "2026-08-10T00:00:00.000Z", "m1"),
      sighting("c2", "n1", "2026-08-12T00:00:00.000Z", "m2"),
    ];
    const listings = listOtherTrailsForNode("n1", "current", sightings);
    expect(listings).toEqual([
      { conversationId: "c2", messageId: "m2", lastSeenAt: "2026-08-12T00:00:00.000Z" },
    ]);
  });

  it("orders other conversations newest first and caps at MAX_TRANSFER_LISTINGS", () => {
    const sightings = Array.from({ length: MAX_TRANSFER_LISTINGS + 2 }, (_, i) =>
      sighting(`c${i}`, "n1", `2026-08-0${i + 1}T00:00:00.000Z`),
    );
    const listings = listOtherTrailsForNode("n1", "current", sightings);
    expect(listings).toHaveLength(MAX_TRANSFER_LISTINGS);
    expect(listings[0]?.conversationId).toBe(`c${MAX_TRANSFER_LISTINGS + 1}`);
  });

  it("ignores sightings of a different node", () => {
    const sightings = [sighting("c2", "other-node", "2026-08-10T00:00:00.000Z")];
    expect(listOtherTrailsForNode("n1", "current", sightings)).toEqual([]);
  });
});
