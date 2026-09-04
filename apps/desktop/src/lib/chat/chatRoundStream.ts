/**
 * Purpose: running one round's streaming call and deciding what survives it — the ordinary
 * finish, a stop that kept a partial reply, and the degradations worth recording. Split out
 * of chatSendRound so that file stays about assembling the round; the money rules live here
 * because this is the only place that sees both the stop and the usage behind it.
 * Main exports: streamRoundReply, StreamedRound.
 */
import {
  type ChatMessage,
  ChatStreamAbortedError,
  createLlmClient,
  type LlmClientConfig,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import { recordAiFailure } from "../platform/failureLog";
import { isAbortError } from "./chatStreamControl";

export interface StreamedRound {
  /** Null when the round was stopped before a single delta arrived: there is no reply to
   * persist. `usage` may still be non-zero, and still has to be metered. */
  content: string | null;
  usage: TokenUsage;
  /** True when the learner pressed stop (ChatGPT model: the partial reply is kept). */
  stoppedEarly: boolean;
}

export async function streamRoundReply(params: {
  config: LlmClientConfig;
  history: ChatMessage[];
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<StreamedRound> {
  let streamedSoFar = "";
  try {
    const result = await createLlmClient(params.config).chatStream(
      params.history,
      (delta) => {
        streamedSoFar += delta;
        params.onDelta(delta);
      },
      { signal: params.signal },
    );
    // Frames the client could not read (a gateway heartbeat, a half-shaped chunk). The answer
    // survived, but a lost frame can be a lost tail or a lost usage report — spec 014's table
    // is where a degradation nobody saw is supposed to become visible.
    if (result.skippedFrames > 0) {
      void recordAiFailure(
        "chat-stream",
        `${result.skippedFrames} unreadable SSE frame(s) skipped for model "${params.config.model}"`,
      );
    }
    return { content: result.content, usage: result.usage, stoppedEarly: false };
  } catch (error) {
    if (!isAbortError(error)) throw error;
    // Stopping does not un-bill the call: the provider charged the prompt and everything it
    // had already generated. Whatever usage reached us before the stop IS this round's cost,
    // and dropping it recorded a real charge as free (宪法原则 2).
    const usage =
      error instanceof ChatStreamAbortedError ? error.usage : { inputTokens: 0, outputTokens: 0 };
    return {
      content: streamedSoFar.length === 0 ? null : streamedSoFar,
      usage,
      stoppedEarly: true,
    };
  }
}
