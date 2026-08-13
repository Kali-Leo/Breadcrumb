/**
 * Purpose: unit tests for companion desktop actions (spec 037) — opening/reusing a companion
 * conversation, creating a teach-back session with the script switch off (stateless fallback),
 * and the chat system prompt's card/memory inclusion. The copy-safety gate lives in
 * companionCopyGate.test.ts, split out to keep this file under the line-count cap.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../stores/settingsStore";
import { sampleCompanionCard } from "./companionTestFixtures";

interface FakeConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  kind: string;
  companion_id: string | null;
}
interface FakeMessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
}

const conversationRows: FakeConversationRow[] = [];
const messageRows: FakeMessageRow[] = [];
const knowledgeStateUpserts: Array<{ conversationId: string; stateJson: string }> = [];

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    conversations: {
      findLatestByCompanion: async (companionId: string, kind: string) =>
        conversationRows
          .filter((row) => row.companion_id === companionId && row.kind === kind)
          .at(-1) ?? null,
      create: async (row: FakeConversationRow) => {
        conversationRows.push(row);
      },
    },
    messages: {
      append: async (row: FakeMessageRow) => {
        messageRows.push(row);
      },
    },
    companionKnowledgeState: {
      upsert: async (conversationId: string, stateJson: string) => {
        knowledgeStateUpserts.push({ conversationId, stateJson });
      },
    },
  })),
}));

const { openCompanionConversation, startCompanionTeachSession, buildCompanionChatSystemPrompt } =
  await import("./companionActions");

afterEach(() => {
  conversationRows.length = 0;
  messageRows.length = 0;
  knowledgeStateUpserts.length = 0;
});

describe("openCompanionConversation", () => {
  it("creates a new companion conversation with the card's first_mes, then reuses it", async () => {
    const firstId = await openCompanionConversation("shichimi");
    expect(conversationRows).toHaveLength(1);
    expect(conversationRows[0]).toMatchObject({ kind: "companion", companion_id: "shichimi" });
    expect(messageRows).toHaveLength(1);
    expect(messageRows[0]?.role).toBe("assistant");
    expect(messageRows[0]?.content.length).toBeGreaterThan(0);

    const secondId = await openCompanionConversation("shichimi");
    expect(secondId).toBe(firstId);
    expect(conversationRows).toHaveLength(1);
  });

  it("throws for an unknown companion id", async () => {
    await expect(openCompanionConversation("nonexistent")).rejects.toThrow();
  });
});

describe("startCompanionTeachSession", () => {
  it("creates a stateless session when the script switch is off", async () => {
    useSettingsStore.setState({
      featureSwitches: { ...useSettingsStore.getState().featureSwitches, companionScript: false },
    });

    const conversationId = await startCompanionTeachSession("闭包", "node-1", {
      knownNodeLabels: ["函数"],
    });

    expect(conversationRows).toHaveLength(1);
    expect(conversationRows[0]).toMatchObject({
      id: conversationId,
      kind: "teach",
      companion_id: "shichimi",
      title: "回讲·闭包",
    });
    expect(knowledgeStateUpserts).toHaveLength(0);
    expect(messageRows).toHaveLength(1);
    expect(messageRows[0]?.content).toContain("闭包");
  });
});

describe("buildCompanionChatSystemPrompt", () => {
  it("includes card identity fields, the AI disclosure, and retrieved memories", () => {
    const prompt = buildCompanionChatSystemPrompt(sampleCompanionCard(), [
      "学习者上次提到在准备考试",
    ]);
    expect(prompt).toContain("Shichimi");
    expect(prompt).toContain("真诚好问");
    expect(prompt).toContain("低于学习者");
    expect(prompt).toContain("AI");
    expect(prompt).toContain("学习者上次提到在准备考试");
  });

  it("omits the memory line entirely when there are no retrieved memories", () => {
    const prompt = buildCompanionChatSystemPrompt(sampleCompanionCard(), []);
    expect(prompt).not.toContain("你记得关于这位学习者的这些事");
  });
});
