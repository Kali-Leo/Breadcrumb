/**
 * Purpose: every user-visible string of the mirror modules in one place (spec 035; spec 046
 * graduated them into the memory palace) — plain statements only (product principle 1: no
 * praise, no performed warmth, no pressure); simlab scans this module against the pressure
 * lexicon and a praise-word blacklist. Design rationale lives in code comments, never on
 * screen (pedagogy stays invisible).
 * Main exports: FEEDBACK_COPY, activityLine, reunionOpener, newConceptLabel,
 * reencounterLabel, wordGuessLabel, teachSessionLabel, evidenceClaimLabel.
 */
import type { MasteryClaimLevel } from "@breadcrumb/core-db";

export const FEEDBACK_COPY = {
  loading: "加载中…",

  // Heatmap — GitHub-garden-style, self-only so no social comparison; records what
  // happened, never sets a target.
  heatmapTitle: "学习热力图",
  heatmapHint: "每格是一天,颜色深浅是当天的学习痕迹数。只记录发生过的,不设目标。",
  heatmapEmpty: "还没有痕迹。开始一段学习对话,这里会出现第一格。",

  // Small wins — concrete progress events (Amabile's progress principle stays in this
  // comment, not on screen).
  smallWinsTitle: "微进展",
  smallWinsHint: "今天与近 7 天,具体前进了什么。",
  smallWinsEmpty: "这个窗口里还没有新的痕迹。打开一段对话,聊到哪里算哪里。",
  smallWinsTodayLabel: "今天",
  smallWinsWeekLabel: "近 7 天",

  // Totals — monotonically increasing, keeps "investment is visible" without streak reset
  // anxiety.
  totalsTitle: "累计",
  totalsHint: "只增不减的总量。",
  totalsConcepts: "认识的概念",
  totalsEncounters: "相遇总次数",
  totalsWordsLearning: "在学的词",
  totalsWordsSettled: "已稳固的词",
  totalsConversations: "学习对话",

  // Reunion — minimal restart after a pause, zero attribution, no backlog counts.
  reunionTitle: "重逢邀请",
  reunionIntro: "这些概念有阵子没一起聊过了。想的话,挑一个去聊聊。",
  reunionEmpty: "暂时没有在等重逢的概念。",
  reunionInviteAction: "去聊聊",

  // Settled — "graduated from review" as the strongest done-language there is.
  settledTitle: "已长期掌握",
  settledHint: "这些内容已稳固,暂别复习;它们仍会在对话里自然出现。",
  settledEmpty: "还没有进入稳固区的内容。稳固需要时间,这里会慢慢长。",
  settledNodesLabel: "概念",
  settledWordsLabel: "词",
  settledShowMore: "展开全部",

  // Evidence — the open-learner-model surface: every judgment can be traced to plain facts.
  evidenceTitle: "判断的来历",
  evidenceHint: "系统对每个概念的看法,都能查到是从哪来的。",
  evidenceEmpty: "选一个概念,看看这个判断是怎么来的。",
  evidencePickerPlaceholder: "搜索已相遇的概念…",
  evidenceEncountersLabel: "相遇记录",
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
  return `回讲了一次:${title}`;
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
