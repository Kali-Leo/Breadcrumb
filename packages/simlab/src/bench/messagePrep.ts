/**
 * Purpose: the one shape difference between providers that the bench has to paper over, and
 * the finding behind it.
 *
 * core-llm appends the answer-language directive as a FINAL system message, so it is the most
 * recent instruction the model reads. SiliconFlow rejects that outright — `HTTP 400, code
 * 20015, "System message must be at the beginning."` — which means every call the product
 * makes fails there before the model has said a word. That is a portability finding about
 * Breadcrumb, not a fact about the model, so the bench folds the trailing system messages
 * into the leading one for such a provider and records that it did.
 *
 * The folded prompt carries the identical instructions in the identical order; only their
 * position moves. It is a weaker prompt (a directive at the top is easier to drift away from
 * than one at the bottom), which is worth knowing when reading that model's languageMatch.
 *
 * Main exports: foldSystemMessagesFirst.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";

/**
 * Moves every system message to the front, merged into one, leaving the user/assistant turns
 * in their original order. A list that already starts with its only system message comes back
 * unchanged (same array contents), so the common path costs nothing.
 */
export function foldSystemMessagesFirst(messages: readonly ChatMessage[]): ChatMessage[] {
  const system = messages.filter((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system");
  if (system.length === 0) return [...messages];
  const merged: ChatMessage = {
    role: "system",
    content: system.map((message) => message.content).join("\n\n"),
  };
  return [merged, ...rest];
}
