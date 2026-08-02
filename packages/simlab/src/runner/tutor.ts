/**
 * Purpose: the tutor half of a simulated round. Mirrors apps/desktop/src/stores/chatStore.ts's
 * sendMessage exactly: unshifts the SAME standing tone system prompt (plain, matter-of-fact,
 * no praise — CLAUDE.md 产品原则 1, 2026-08-02 修订) before every call. Falls back to a
 * non-streaming completion if chatStream's async body iteration fails.
 * Main exports: getTutorReply, TutorReply, STANDING_SYSTEM_PROMPT.
 */
import {
  type ChatMessage,
  createLlmClient,
  type LlmClientConfig,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import { nonStreamingChat } from "./nonStreamingChat";

// MUST MATCH apps/desktop/src/stores/chatStore.ts's standing system prompt string, verbatim.
// If you edit the tone contract, edit both and keep them identical.
export const STANDING_SYSTEM_PROMPT =
  "你是 Breadcrumb 的学习伙伴。语气平实、就事论事，不评判也不夸赞学习者；" +
  "讲解清楚、循序，从对方当前的理解出发。";

export interface TutorReply {
  content: string;
  usage: TokenUsage;
}

export async function getTutorReply(
  config: LlmClientConfig,
  history: readonly ChatMessage[],
): Promise<TutorReply> {
  const messages: ChatMessage[] = [{ role: "system", content: STANDING_SYSTEM_PROMPT }, ...history];
  try {
    const client = createLlmClient(config);
    const result = await client.chatStream(messages, () => undefined);
    return { content: result.content, usage: result.usage };
  } catch (error) {
    // Node's undici Response.body is a ReadableStream; some environments don't support
    // `for await` over it the way core-llm's readSseDataLines expects. Fall back rather than
    // fail the whole round.
    console.warn("tutor: streaming chat failed, falling back to non-streaming:", error);
    return nonStreamingChat(config, messages);
  }
}
