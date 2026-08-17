/**
 * Purpose: the two non-network runtimes the discovery pipeline reaches for, replaced by
 * deterministic local stand-ins — Tauri's `invoke` (only `embed_texts` is ever called on this
 * path, answered with simlab's synthetic bigram embedding) and the LLM's `chatJson` (the batch
 * quality check, answered from a hash of the title, no provider involved). Both count their
 * calls so a test can assert "this ran exactly N times" and "no LLM call happened at all".
 * Main exports: invoke, chatJson, runtimeCallCounts, resetRuntimeDoubles, setQualityScorer.
 */
import { computeSyntheticEmbedding } from "../embedding/syntheticEmbedding";
import { seedFromStrings } from "../util/prng";

export const runtimeCallCounts = { embedTexts: 0, chatJson: 0 };

export function resetRuntimeDoubles(): void {
  runtimeCallCounts.embedTexts = 0;
  runtimeCallCounts.chatJson = 0;
  qualityScorer = defaultQualityScorer;
}

/** Deterministic 0..1 "substance" from the title alone — stable across runs, and low enough on
 * some items that the ranking's demotion branch is actually exercised. */
function defaultQualityScorer(title: string): number {
  return (seedFromStrings([title]) % 1000) / 1000;
}

let qualityScorer: (title: string) => number = defaultQualityScorer;

/** Lets one test starve the whole batch (every score below the demotion floor) or bless it. */
export function setQualityScorer(scorer: (title: string) => number): void {
  qualityScorer = scorer;
}

interface EmbedTextsArguments {
  texts: string[];
}

function isEmbedTextsArguments(value: unknown): value is EmbedTextsArguments {
  if (typeof value !== "object" || value === null) return false;
  const texts = (value as { texts?: unknown }).texts;
  return Array.isArray(texts) && texts.every((entry) => typeof entry === "string");
}

/** Stands in for @tauri-apps/api/core's invoke. Anything but `embed_texts` rejects, the same way
 * a command that is not registered does — nothing else on the discovery path should call it. */
export async function invoke<Result>(command: string, args?: unknown): Promise<Result> {
  if (command !== "embed_texts") {
    throw new Error(`simlab discovery harness: unexpected tauri command "${command}"`);
  }
  if (!isEmbedTextsArguments(args)) {
    throw new Error("simlab discovery harness: embed_texts called without a texts array");
  }
  runtimeCallCounts.embedTexts += 1;
  return args.texts.map((text) => computeSyntheticEmbedding(text)) as Result;
}

interface QualityCheckMessage {
  role: string;
  content: string;
}

/** Pulls the ids back out of the prompt the quality check built (`id: <id>`, one per line), so
 * the answer is about the batch that was actually sent rather than about a list the test kept on
 * the side. */
function idsFromMessages(messages: readonly QualityCheckMessage[]): string[] {
  const text = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
  const ids: string[] = [];
  for (const match of text.matchAll(/^id: (.+)$/gm)) {
    const id = match[1]?.trim();
    if (id !== undefined && id.length > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export interface ChatJsonResultDouble<Parsed> {
  parsed: Parsed;
  usage: { inputTokens: number; outputTokens: number };
}

interface ParseLike<Parsed> {
  parse(value: unknown): Parsed;
}

/**
 * Stands in for @breadcrumb/core-llm's chatJson on the quality-check path: builds a scores array
 * for the ids in the prompt and runs it through the caller's own schema, so a shape the real
 * contract would reject is rejected here too.
 */
export async function chatJson<Parsed>(
  _config: unknown,
  messages: readonly QualityCheckMessage[],
  schema: ParseLike<Parsed>,
): Promise<ChatJsonResultDouble<Parsed>> {
  runtimeCallCounts.chatJson += 1;
  const scores = idsFromMessages(messages).map((id) => ({ id, substance: qualityScorer(id) }));
  return {
    parsed: schema.parse({ scores }),
    usage: { inputTokens: 400 + scores.length * 20, outputTokens: 20 + scores.length * 8 },
  };
}
