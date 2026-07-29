/**
 * Purpose: the single Drizzle schema file — every persisted table in Breadcrumb lives here.
 * Main exports: settings, conversations, messages, llmCalls tables + row types.
 * Timestamps are ISO-8601 strings (UTC); costs are stored in micro-units of the currency
 * (1 USD = 1_000_000 microUsd) to avoid floating point drift.
 */
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Key-value store for app settings (API config, network switch, custom prices...). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_messages_conversation").on(table.conversationId)],
);

/** One row per LLM API call: the raw material for all cost meters. */
export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").references(() => conversations.id),
    /** Which feature made the call, e.g. "chat"; future plugins use their plugin id. */
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costMicros: integer("cost_micros").notNull(),
    currency: text("currency").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_llm_calls_created").on(table.createdAt)],
);

export type SettingRow = typeof settings.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type LlmCallRow = typeof llmCalls.$inferSelect;
