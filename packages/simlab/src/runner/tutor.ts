/**
 * Purpose: the tutor half of a simulated round. Mirrors the desktop send pipeline: unshifts
 * the same teaching contract (adaptive mode) the product uses — both sides import it from
 * @breadcrumb/core-teaching, so simlab always tests the shipped prompt (spec 038 T2).
 * Falls back to a non-streaming completion if chatStream's async body iteration fails.
 * Main exports: getTutorReply, TutorReply, STANDING_SYSTEM_PROMPT.
 */
import {
  type ChatMessage,
  createLlmClient,
  type LlmClientConfig,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import { TEACHING_CONTRACT_BASE } from "@breadcrumb/core-teaching";
import { nonStreamingChat } from "./nonStreamingChat";

export const STANDING_SYSTEM_PROMPT: string = TEACHING_CONTRACT_BASE;

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
