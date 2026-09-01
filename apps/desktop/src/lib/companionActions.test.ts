/**
 * Purpose: unit tests for companion desktop actions (spec 037) — opening/reusing a companion
 * conversation, delivering the teach-back invitation as her own chat message, the script
 * seeding's switch-off no-op, and the chat system prompt's card/memory inclusion. The
 * copy-safety gate lives in companionCopyGate.test.ts, split out for the line-count cap.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n";
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
      touch: async () => {},
    },
    messages: {
      append: async (row: FakeMessageRow) => {
        messageRows.push(row);
      },
      listByConversation: async (conversationId: string) =>
        messageRows.filter((row) => row.conversation_id === conversationId),
    },
    companionKnowledgeState: {
      upsert: async (conversationId: string, stateJson: string) => {
        knowledgeStateUpserts.push({ conversationId, stateJson });
      },
    },
  })),
}));

const {
  openCompanionConversation,
  seedTeachScriptForConversation,
  buildCompanionChatSystemPrompt,
} = await import("./companionActions");

// The helper's messages are rendered from the catalogues at creation time, so the catalogues
// have to be loaded before any of them is composed.
beforeAll(async () => {
  await initI18n();
});

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

describe("seedTeachScriptForConversation", () => {
  it("is a silent no-op when the script switch is off", async () => {
    useSettingsStore.setState({
      featureSwitches: { ...useSettingsStore.getState().featureSwitches, companionScript: false },
    });
    await seedTeachScriptForConversation("conv-1", "闭包", ["函数"]);
    expect(knowledgeStateUpserts).toHaveLength(0);
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
