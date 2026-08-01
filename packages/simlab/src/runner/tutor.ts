/**
 * Purpose: the tutor half of a simulated round. Mirrors apps/desktop/src/stores/chatStore.ts's
 * sendMessage exactly: NO system prompt at all — chatStore.ts sends the raw message history
 * straight to the LLM (its only system message is an optional anchored-node hint, which
 * simlab sessions never trigger since they never anchor a node — documented divergence).
 * Falls back to a non-streaming completion if chatStream's async body iteration fails.
 * Main exports: getTutorReply, TutorReply.
 */
import {
  type ChatMessage,
  createLlmClient,
  type LlmClientConfig,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import { nonStreamingChat } from "./nonStreamingChat";

export interface TutorReply {
  content: string;
  usage: TokenUsage;
}

export async function getTutorReply(
  config: LlmClientConfig,
  history: readonly ChatMessage[],
): Promise<TutorReply> {
  try {
    const client = createLlmClient(config);
    const result = await client.chatStream(history, () => undefined);
    return { content: result.content, usage: result.usage };
  } catch (error) {
    // Node's undici Response.body is a ReadableStream; some environments don't support
    // `for await` over it the way core-llm's readSseDataLines expects. Fall back rather than
    // fail the whole round.
    console.warn("tutor: streaming chat failed, falling back to non-streaming:", error);
    return nonStreamingChat(config, history);
  }
}
