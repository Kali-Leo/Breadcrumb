/**
 * Purpose: prompt assembly for a focus (explain-word) session's two node kinds — deliberately
 * excludes the host conversation's history, which is the source of both the speed and the
 * token savings of staying inside a focus session.
 * Main exports: FOCUS_SYSTEM_PROMPT, FocusPromptMessage, buildWordExplainMessages,
 * buildQuestionMessages.
 */

export interface FocusPromptMessage {
  role: "system" | "user";
  content: string;
}

/** Plain teaching voice for every focus-session reply. It describes no reply structure —
 * "结论先行" was narrated back as scaffolding text — and states the register once. */
export const FOCUS_SYSTEM_PROMPT =
  "你在专注模式里解释一个具体的词或问题。直接说清楚它是什么，能短则短，不复述问题，不评价学习者。";

/** A solid-line child station: context is the parent node's full answer plus the picked
 * word. Without parent context (map's 继续 entry, reopened-session retries) it degrades to a
 * plain explanation — an empty quote makes the model refuse. */
export function buildWordExplainMessages(
  parentAnswerText: string,
  word: string,
): FocusPromptMessage[] {
  const context = parentAnswerText.trim();
  return [
    { role: "system", content: FOCUS_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        context.length === 0
          ? `请讲解「${word}」。`
          : `下面这段讲解里出现了「${word}」：\n\n${context}\n\n请解释「${word}」在这里的含义。`,
    },
  ];
}

/** A dashed diagonal station: context is every ancestor's full answer, root to parent, in
 * order, plus the free-text question. */
export function buildQuestionMessages(
  ancestorAnswers: readonly { label: string; answerText: string }[],
  question: string,
): FocusPromptMessage[] {
  const chain = ancestorAnswers.map((node) => `### ${node.label}\n${node.answerText}`).join("\n\n");
  return [
    { role: "system", content: FOCUS_SYSTEM_PROMPT },
    { role: "user", content: `${chain}\n\n${question}` },
  ];
}
