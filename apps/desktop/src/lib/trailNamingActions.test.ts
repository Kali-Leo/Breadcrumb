/**
 * Purpose: unit tests for refreshConversationAutoTitle's write gating — writes a fresh auto
 * name from the conversation's sightings, skips once frozen by a rename, and skips a no-op
 * write when nothing changed.
 */
import type { ConversationRow, MessageRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { refreshConversationAutoTitle, type TrailNamingRepos } from "./trailNamingActions";

function makeRepos(
  conversation: ConversationRow,
  sightings: NodeSightingRow[],
  messages: MessageRow[],
): { repos: TrailNamingRepos; writes: (string | null)[] } {
  const writes: (string | null)[] = [];
  const repos: TrailNamingRepos = {
    conversations: {
      getById: async () => conversation,
      setAutoTitle: async (_id, autoTitle) => {
        writes.push(autoTitle);
      },
    },
    nodeSightings: { listByConversation: async () => sightings },
    messages: { listByConversation: async () => messages },
  };
  return { repos, writes };
}

function sighting(nodeId: string, createdAt: string): NodeSightingRow {
  return {
    id: `s-${nodeId}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: createdAt,
  };
}

function userMessage(content: string): MessageRow {
  return {
    id: "m1",
    conversation_id: "c1",
    role: "user",
    content,
    created_at: "t",
    teaching_mode: null,
    parent_id: null,
  };
}

const labelsByNode = new Map([
  ["n1", "闭包"],
  ["n2", "事件循环"],
]);

describe("refreshConversationAutoTitle", () => {
  it("writes the fresh auto title for an untouched conversation", async () => {
    const conversation: ConversationRow = {
      id: "c1",
      title: "闭包是什么",
      created_at: "t",
      updated_at: "t",
      kind: "chat",
      companion_id: null,
      auto_title: null,
    };
    const { repos, writes } = makeRepos(
      conversation,
      [sighting("n1", "2026-08-13T10:00:00.000Z"), sighting("n2", "2026-08-13T10:01:00.000Z")],
      [userMessage("闭包是什么")],
    );
    await refreshConversationAutoTitle(repos, "c1", labelsByNode);
    expect(writes).toEqual(["闭包 → 事件循环"]);
  });

  it("skips writing once the conversation has been renamed away from its initial title", async () => {
    const conversation: ConversationRow = {
      id: "c1",
      title: "我改过的名字",
      created_at: "t",
      updated_at: "t",
      kind: "chat",
      companion_id: null,
      auto_title: null,
    };
    const { repos, writes } = makeRepos(
      conversation,
      [sighting("n1", "2026-08-13T10:00:00.000Z")],
      [userMessage("闭包是什么")],
    );
    await refreshConversationAutoTitle(repos, "c1", labelsByNode);
    expect(writes).toEqual([]);
  });

  it("skips a no-op write when the computed name is unchanged", async () => {
    const conversation: ConversationRow = {
      id: "c1",
      title: "闭包是什么",
      created_at: "t",
      updated_at: "t",
      kind: "chat",
      companion_id: null,
      auto_title: "「闭包」",
    };
    const { repos, writes } = makeRepos(
      conversation,
      [sighting("n1", "2026-08-13T10:00:00.000Z")],
      [userMessage("闭包是什么")],
    );
    await refreshConversationAutoTitle(repos, "c1", labelsByNode);
    expect(writes).toEqual([]);
  });

  it("does nothing when the conversation no longer exists", async () => {
    const writes: (string | null)[] = [];
    const repos: TrailNamingRepos = {
      conversations: {
        getById: async () => null,
        setAutoTitle: async (_id, autoTitle) => {
          writes.push(autoTitle);
        },
      },
      nodeSightings: { listByConversation: async () => [] },
      messages: { listByConversation: async () => [] },
    };
    await refreshConversationAutoTitle(repos, "missing", labelsByNode);
    expect(writes).toEqual([]);
  });
});
