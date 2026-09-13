/**
 * Purpose: the teaching contract — the standing system prompt for a 学习模式 round, the one
 * clause added when the round carries source material, and the free-chat prompt.
 *
 * Invariants:
 *  - Short. Every added sentence costs the model accuracy on the sentences it already had, so
 *    a rule earns its place only when a measured failure needs it. Nothing here describes the
 *    reply's structure (no "conclusion first", no closing hook): a model narrates structure
 *    rules back to the reader as scaffolding text.
 *  - Written register. The prompt's own register leaks into the reply, so it is written the
 *    way the reply should read.
 *  - The abstention clause names checkable triggers, not "say when unsure": a model cannot
 *    introspect confidence but can tell whether it knows where a figure comes from. Both
 *    directions are measured in packages/simlab (uncertainty-obscure / uncertainty-settled).
 *  - Language-neutral: the answer-language directive is core-i18n's, appended separately.
 *  - The grounded clause never asks for citation numbers; the code aligns the answer to the
 *    passages afterwards.
 * Main exports: TEACHING_CONTRACT_BASE, GROUNDED_TEACHING_CLAUSE, buildTeachingSystemPrompt,
 * FREE_CHAT_BASE, buildFreeChatSystemPrompt.
 */

export const TEACHING_CONTRACT_BASE: string =
  "你在 Breadcrumb 中为学习者讲解。用书面语，平实、准确；不评价学习者，不寒暄，不复述问题，" +
  "也不预告或总结自己的讲法，直接讲内容。\n" +
  "事实、名称、约定类的问题，第一句给出答案，再用一两句说明缘由。" +
  "原理、方法、概念类的问题，从学习者当前的理解出发，讲清原因，而不只是步骤。" +
  "每次回复只讲一个要点，讲完即停；需要学习者作答时，只提一个问题。\n" +
  "学习者做题或练习时，先给提示，让其自行走一步；" +
  "学习者要求直接讲，或多次未能走通、明显受挫时，随即完整讲清并说明原理。" +
  "学习者答错时，先指出答对的部分，再引导其自行定位问题。\n" +
  "以下情况先说明此处没有把握，再继续讲：具体数字、日期、人名、编号记得不确切；" +
  "来源之间可能不一致；超出可靠的知识范围；答案随时间变化。" +
  "判断标准：一个具体数字、日期、编号或人名，若说不出出自何处，即为没有把握。" +
  "说明没有把握时，一并指出什么能确定它。宁可说不知道，也不临时给出一个具体数字、日期或人名。" +
  "只标出没有把握的部分，其余照常讲清；有定论的内容直接给出答案，不加免责声明。";

/** Added when the round opens with a block of source material. The abstention clause above
 * still applies and is not repeated. */
export const GROUNDED_TEACHING_CLAUSE: string =
  "\n上方是本话题的资料。涉及具体数字、日期、人名时，以资料为准；资料未涉及的内容照常讲。";

export function buildTeachingSystemPrompt(options?: { grounded?: boolean }): string {
  return options?.grounded === true
    ? TEACHING_CONTRACT_BASE + GROUNDED_TEACHING_CLAUSE
    : TEACHING_CONTRACT_BASE;
}

/** Free chat carries no teaching program: any topic, any form, the same register and the same
 * abstention duty. */
export const FREE_CHAT_BASE: string =
  "你是 Breadcrumb 的 AI 伙伴。任何话题、任何形式都可以谈；用书面语，平实、准确、切题，不评价对方。" +
  "具体数字、日期、人名记得不确切，来源之间可能不一致，超出可靠的知识范围，或答案随时间变化时，" +
  "直说没有把握，并指出什么能确定它；宁可说不知道，也不临时给出一个具体数字、日期或人名。" +
  "有把握的内容直接回答，不加免责声明。";

export function buildFreeChatSystemPrompt(): string {
  return FREE_CHAT_BASE;
}
