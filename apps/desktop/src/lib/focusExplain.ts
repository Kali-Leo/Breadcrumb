/**
 * Purpose: runs one focus-session node's streaming completion and meters it under the
 * dedicated "focus-explain" purpose (spec 042 §2) — no history assembly, no persistence;
 * callers own building the prompt messages, saving the resulting node, and error handling.
 * Main exports: streamFocusAnswer.
 */
import { type ChatMessage, createLlmClient, type TokenUsage } from "@breadcrumb/core-llm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { recordMeteredCall } from "./metering";

export interface StreamFocusAnswerInput {
  messages: readonly ChatMessage[];
  apiConfig: ApiConfig;
  conversationId: string;
  onDelta: (delta: string) => void;
}

export interface StreamFocusAnswerResult {
  content: string;
  usage: TokenUsage;
}

/** Streams a focus node's answer and records its cost. Throws on failure — the caller (the
 * focus overlay) is responsible for recordAiFailure and showing a plain error line. */
export async function streamFocusAnswer(
  input: StreamFocusAnswerInput,
): Promise<StreamFocusAnswerResult> {
  const client = createLlmClient({ ...input.apiConfig, fetchImpl: tauriFetch });
  const result = await client.chatStream(input.messages, input.onDelta);

  await recordMeteredCall({
    purpose: "focus-explain",
    conversationId: input.conversationId,
    model: input.apiConfig.model,
    usage: result.usage,
  });

  return { content: result.content, usage: result.usage };
}
