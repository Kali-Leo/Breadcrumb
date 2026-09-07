/**
 * Purpose: what the app loads when it opens, in order, each step isolated from the others —
 * one feature failing to load (a language pack the schema now refuses, a table a migration
 * left odd) must not take the chat, the knowledge tree, or the launch event down with it. A
 * step that fails records itself and the next one still runs.
 * Main exports: loadEverythingOnce.
 */
import { appEventBus, useChatStore } from "../../stores/chatStore";
import { useCompanionStore } from "../../stores/companionStore";
import { useDiglotStore } from "../../stores/diglotStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { runDedupSweep } from "../knowledge/dedupSweep";
import { backfillMissingEmbeddings } from "./embeddings";
import { degradeSilently } from "./failureLog";
import { nowIso } from "./time";

async function step(purpose: string, load: () => Promise<unknown>): Promise<void> {
  try {
    await load();
  } catch (error) {
    await degradeSilently(purpose, error);
  }
}

export async function loadEverythingOnce(): Promise<void> {
  await step("settings", () => useSettingsStore.getState().loadFromDatabase());
  await step("diglot-weave", () => useDiglotStore.getState().loadFromDatabase());
  await step("chat", () => useChatStore.getState().loadFromDatabase());
  await step("knowledge-tree", () => useKnowledgeStore.getState().loadTree());
  await step("companion", () => useCompanionStore.getState().initialize());
  // Settings are in by now, so launch-time work can read its switches and credentials.
  appEventBus.emit("app:launched", { launchedAt: nowIso() });
  // Fire-and-forget: catches up any node missing its embedding without blocking the UI,
  // then runs the duplicate-node merge sweep once embeddings are in place.
  void backfillMissingEmbeddings()
    .then(() => runDedupSweep())
    .catch((error: unknown) => degradeSilently("embeddings", error));
}
