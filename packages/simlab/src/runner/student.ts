/**
 * Purpose: the student half of a simulated round — builds the persona's tau-bench system
 * prompt, flips the shared transcript's roles into the student's own first-person point of
 * view (its past turns become "assistant", the tutor's past turns become "user"), and
 * detects the ###STOP### termination token. Same non-streaming fallback as tutor.ts.
 * Main exports: getStudentReply, StudentReply.
 */
import {
  type ChatMessage,
  createLlmClient,
  type LlmClientConfig,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import type { Persona } from "../persona/schema";
import { buildStudentSystemPrompt, STOP_TOKEN } from "../persona/studentPrompt";
import { nonStreamingChat } from "./nonStreamingChat";

export interface StudentReply {
  content: string;
  usage: TokenUsage;
  isStop: boolean;
}

/** The shared transcript uses the app's own convention (role "user" = the student's turn,
 * "assistant" = the tutor's turn). Flipped here so the student's own LLM call sees itself as
 * "assistant" and the tutor as "user", matching how a real chat participant sees its own
 * conversation. */
function flipRoles(transcript: readonly ChatMessage[]): ChatMessage[] {
  return transcript.map((message) => ({
    role:
      message.role === "user" ? "assistant" : message.role === "assistant" ? "user" : message.role,
    content: message.content,
  }));
}

/** A journey action (see journeyActions.ts) may seed the NEXT conversation's opening topic
 * — either a concrete recommended/revisited label, or a nudge to jump to something unrelated.
 * Only meaningful when `transcript` is empty (the start of a new conversation). */
export interface TopicHint {
  label: string | null;
  isDomainJump: boolean;
  /** For a domain jump only: a concrete untouched-domain label picked from the persona's own
   * brief (journeyActions.ts), so the opener is actually built from something outside the
   * touched-labels set instead of leaving the model to invent an arbitrary new topic. */
  domainHint?: string | null;
}

function buildTopicHintMessage(hint: TopicHint | undefined): ChatMessage | null {
  if (hint === undefined) return null;
  if (hint.isDomainJump) {
    return hint.domainHint != null
      ? {
          role: "system",
          content: `这次你想换个完全不相关的新话题聊聊：「${hint.domainHint}」，不用接着上次的内容。`,
        }
      : { role: "system", content: "这次你想换个完全不相关的新话题聊聊，不用接着上次的内容。" };
  }
  if (hint.label !== null) {
    return { role: "system", content: `这次对话你想聊聊：「${hint.label}」。` };
  }
  return null;
}

export async function getStudentReply(
  config: LlmClientConfig,
  persona: Persona,
  transcript: readonly ChatMessage[],
  topicHint?: TopicHint,
): Promise<StudentReply> {
  const hintMessage = buildTopicHintMessage(topicHint);
  const messages: ChatMessage[] = [
    { role: "system", content: buildStudentSystemPrompt(persona) },
    ...(hintMessage ? [hintMessage] : []),
    ...flipRoles(transcript),
  ];

  let content: string;
  let usage: TokenUsage;
  try {
    const client = createLlmClient(config);
    const result = await client.chatStream(messages, () => undefined);
    content = result.content;
    usage = result.usage;
  } catch (error) {
    console.warn("student: streaming chat failed, falling back to non-streaming:", error);
    const fallback = await nonStreamingChat(config, messages);
    content = fallback.content;
    usage = fallback.usage;
  }
  return { content, usage, isStop: content.trim() === STOP_TOKEN };
}
