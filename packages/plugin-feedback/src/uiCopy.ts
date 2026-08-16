/**
 * Purpose: every user-visible string of the mirror modules in one place (spec 035; spec 046
 * graduated them into the memory palace) — plain statements only (product principle 1: no
 * praise, no performed warmth, no pressure); simlab scans this module against the pressure
 * lexicon and a praise-word blacklist. Design rationale lives in code comments, never on
 * screen (pedagogy stays invisible).
 * Main exports: FEEDBACK_COPY, activityLine, heatmapCellLine, reunionOpener,
 * newConceptLabel, reencounterLabel, wordGuessLabel, teachSessionLabel, evidenceClaimLabel.
 */
import type { MasteryClaimLevel } from "@breadcrumb/core-db";

export const FEEDBACK_COPY = {
  loading: "加载中…",

  // Heatmap — GitHub-garden-style, self-only so no social comparison; records what
  // happened, never sets a target. The how-to-read sentence lives on hover (progressive
  // disclosure), not as a standing caption.
  heatmapTitle: "学习热力图",
  heatmapHoverNote: "每格是一天,颜色越深,那天学得越多。",
  heatmapEmpty: "还没有痕迹。开始一段学习对话,这里会出现第一格。",

  // Small wins — concrete progress events (Amabile's progress principle stays in this
  // comment, not on screen).
  smallWinsTitle: "最近进展",
  smallWinsHint: "今天与近 7 天,具体前进了什么。",
  smallWinsEmpty: "这个窗口里还没有新的痕迹。打开一段对话,聊到哪里算哪里。",
  smallWinsTodayLabel: "今天",
  smallWinsWeekLabel: "近 7 天",

  // Totals — monotonically increasing, keeps "investment is visible" without streak reset
  // anxiety.
  totalsTitle: "累计",
  totalsHint: "只增不减的总量。",
  totalsConcepts: "认识的概念",
  totalsEncounters: "接触过的次数",
  totalsWordsLearning: "在学的词",
  totalsWordsSettled: "已稳固的词",
  totalsConversations: "学习对话",

  // Reunion — minimal restart after a pause, zero attribution, no backlog counts.
  reunionTitle: "一起回顾",
  reunionIntro: "这些概念有阵子没一起聊过了。想的话,挑一个去聊聊。",
  reunionEmpty: "暂时没有在等回顾的概念。",
  reunionInviteAction: "去聊聊",

  // Settled — "graduated from review" as the strongest done-language there is.
  settledTitle: "已长期掌握",
  settledHint: "这些内容已稳固,暂别复习;它们仍会在对话里自然出现。",
  settledEmpty: "还没有进入稳固区的内容。稳固需要时间,这里会慢慢长。",
  settledNodesLabel: "概念",
  settledWordsLabel: "词",
  settledShowMore: "展开全部",

  // Trends — self-comparison only, no target lines (design rationale stays here in the
  // comment, never on screen — Leo 2026-08-16). Each line explains itself on legend hover
  // (one complete sentence per line); no standing caption paragraphs.
  trendsTitle: "趋势",
  trendsEmpty: "线条会随学习慢慢出现。",
  trendLayersMemoryLabel: "记忆",
  trendLayersUnderstandingLabel: "理解",
  trendLayersIntuitionLabel: "直觉",
  // memory(t) = Σ retrievability over sighted concepts (plugin-memory layers.ts) — decays
  // with the forgetting curve, phrased as "自然消退" without naming the mechanism.
  trendLayersMemoryNote: "估算这一天你还能想起来的概念有多少;一阵子不接触,会随时间自然消退。",
  // understanding(t) = Σ claimScore × retrievability — the claim-backed share of memory.
  trendLayersUnderstandingNote: "记得的概念里,有你自己讲解过或说过学过作支撑的那部分,也是估算。",
  // intuition(t) = Σ retrievability over long-stable concepts with a recorded productive use.
  trendLayersIntuitionNote: "最粗略的估算:已经长期稳固、而且你在对话里自己用过的那部分。",
  trendWordsTitle: "词汇",
  trendWordsSettledLabel: "已稳固超过一个月的词",
  // Word-chart legend hover notes — same layer semantics replayed over woven words
  // (wordSettledSeries.ts): memory = Σ replayed-card retrievability; intuition = the
  // long-stable, productively-used share; settled folds the old cold-start caption in.
  trendWordsMemoryNote: "估算这一天你还能想起来的词有多少;一阵子不接触,会随时间自然消退。",
  trendWordsIntuitionNote: "最粗略的估算:已经长期稳固、而且你在自己的话里用过的那部分词。",
  trendWordsSettledNote: "数的是已经稳固超过一个月的词;新词稳固需要时间,这条线前段为 0 是正常的。",

  // Evidence — the open-learner-model surface: every judgment can be traced to plain facts.
  evidenceTitle: "这些判断是怎么来的",
  evidenceHint: "系统对每个概念的看法,都能查到是从哪来的。",
  evidenceEmpty: "选一个概念,看看这个判断是怎么来的。",
  evidencePickerPlaceholder: "搜索接触过的概念…",
  evidenceEncountersLabel: "接触记录",
  evidenceClaimsLabel: "来自你的证据",
  evidenceClaimLearned: "你说过:这个学过",
  evidenceClaimFamiliar: "你说过:这个比较熟",
  evidenceClaimTaughtPrincipled: "你讲过它的原理",
  evidenceClaimTaughtSurface: "你把它复述过一遍",
} as const;

/** Heatmap's one-line summary: cumulative active days only — run/streak counts were ruled
 * out (a broken run reads as a whip; the cumulative count keeps investment visible). */
export function activityLine(activeDays: number): string {
  return `活跃 ${activeDays} 天`;
}

/** Per-cell hover line for the heatmap ("YYYY-MM-DD" + that day's footprint count) — the
 * count is a plain fact ("痕迹" matches heatmapEmpty's language), never a target or gap. */
export function heatmapCellLine(date: string, count: number): string {
  const [, monthPart, dayPart] = date.split("-");
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!Number.isInteger(month) || !Number.isInteger(day)) return date;
  const dayLabel = `${month}月${day}日`;
  return count === 0 ? dayLabel : `${dayLabel},留下 ${count} 个学习痕迹`;
}

/** Reunion session opener — composed locally at creation time (zero LLM). Seeding the chat
 * with this assistant turn gives the model and the learner the same context: a purposeful
 * entry point must never land in a context-less conversation (Leo 2026-08-13). */
export function reunionOpener(title: string): string {
  return `这次来重逢「${title}」。先用自己的话说说你对它还有什么印象,从记得的部分开始就好;剩下的我来补。`;
}

/** Small-wins label: a node met for the first time inside the window. */
export function newConceptLabel(title: string): string {
  return `新认识:${title}`;
}

/** Small-wins label: a node met again inside the window, first met before it. */
export function reencounterLabel(title: string): string {
  return `重逢:${title}`;
}

/** Small-wins label: a woven word guessed correctly or closely inside the window. */
export function wordGuessLabel(lemma: string, isClose: boolean): string {
  return isClose ? `词汇:「${lemma}」接近了` : `词汇:「${lemma}」猜对了`;
}

/** Small-wins label: a teach-back conversation held inside the window. */
export function teachSessionLabel(title: string): string {
  return `讲了一次:${title}`;
}

/** Evidence section's per-claim label — which plain fact produced the mastery claim. */
export function evidenceClaimLabel(level: MasteryClaimLevel): string {
  switch (level) {
    case "learned":
      return FEEDBACK_COPY.evidenceClaimLearned;
    case "familiar":
      return FEEDBACK_COPY.evidenceClaimFamiliar;
    case "taught_principled":
      return FEEDBACK_COPY.evidenceClaimTaughtPrincipled;
    case "taught_surface":
      return FEEDBACK_COPY.evidenceClaimTaughtSurface;
    default:
      return level satisfies never;
  }
}
