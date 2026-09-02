/**
 * Purpose: prompt assembly for a focus (explain-word) session's two node kinds (spec 042 §2)
 * — deliberately excludes the host conversation's history, which is the source of both the
 * speed and the token savings of staying inside a focus session.
 * Main exports: FOCUS_SYSTEM_PROMPT, FocusPromptMessage, buildWordExplainMessages,
 * buildQuestionMessages.
 */

export interface FocusPromptMessage {
  role: "system" | "user";
  content: string;
}

/** Plain teaching voice for every focus-session reply: state the answer first, stay short,
 * never evaluate or praise the learner (product principle 1). */
export const FOCUS_SYSTEM_PROMPT =
  "你在专注模式里回答一个具体的词或问题。结论先行，直接说清楚是什么；能短则短，不需要开场白或客套；不评价、不夸赞学习者。";

/** A solid-line child station: context is the parent node's full answer plus the picked
 * word (spec 042 §2 实线). Without parent context (map's 继续 entry, reopened-session
 * retries) it degrades to a plain explanation — an empty quote makes the model refuse. */
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
 * order, plus the free-text question (spec 042 §2 虚线). */
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
