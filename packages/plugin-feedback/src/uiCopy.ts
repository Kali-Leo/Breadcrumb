/**
 * Purpose: every user-visible string of the feedback lab in one place (spec 035) — plain
 * statements only (product principle 1: no praise, no performed warmth, no pressure);
 * simlab scans this module against the pressure lexicon and a praise-word blacklist.
 * Main exports: FEEDBACK_COPY, continuityLine, reunionLine, dailyBiteLine, gaugeLine,
 * newConceptLabel, reencounterLabel, wordGuessLabel, teachSessionLabel, teachingModeLine,
 * evidenceClaimLabel.
 */
import type { MasteryClaimLevel } from "@breadcrumb/core-db";

export const FEEDBACK_COPY = {
  loading: "加载中…",
  disabledTitle: "🪞 反馈实验室还没打开",
  disabledHint: "去设置里开启「反馈实验室」开关即可使用",
  panelIntro:
    "🪞 反馈实验室试验「让学习被看见」的候选形式:全部由本地数据计算,零 token;成熟的形式会长进正式界面。",
  heatmapTitle: "学习热力图",
  heatmapHint: "每格是一天,颜色深浅是当天的学习痕迹数。只记录发生过的,不设目标。",
  heatmapEmpty: "还没有痕迹。开始一段学习对话,这里会出现第一格。",
  heatmapBasis: "依据:GitHub 草地 / Anki 社区——连续投入被看见本身有效;仅自见,免疫社会比较。",
  smallWinsTitle: "微进展",
  smallWinsHint: "今天与近 7 天,具体前进了什么。",
  smallWinsEmpty: "这个窗口里还没有新的痕迹。打开一段对话,聊到哪里算哪里。",
  smallWinsBasis: "依据:Amabile 进展原则——微小进展是最好一天的头号预测因子。",
  smallWinsTodayLabel: "今天",
  smallWinsWeekLabel: "近 7 天",
  totalsTitle: "累计",
  totalsHint: "只增不减的总量。",
  totalsBasis: "依据:streak 的有效内核是「投入可见」;累计量保留它,去掉清零焦虑。",
  totalsConcepts: "认识的概念",
  totalsEncounters: "相遇总次数",
  totalsWordsLearning: "在学的词",
  totalsWordsSettled: "已稳固的词",
  totalsConversations: "学习对话",
  reunionTitle: "重逢邀请",
  reunionEmpty: "暂时没有在等重逢的概念。",
  reunionInviteAction: "去聊聊",
  reunionBasis: "依据:Hattie「下一步」+ 中断后只给最小重启动作(Marlatt 1985),零归因。",
  dailyBiteTitle: "今日一份",
  dailyBiteBasis: "依据:goal-gradient + 格式塔闭合;未完成明日不追问、不累积。",
  dailyBiteComplete: "今天的一份已完成。",
  dailyBiteReunionLabel: "重逢",
  dailyBiteNewLabel: "新认识",
  gaugeTitle: "系统仪表",
  gaugeHint: "这里评价的是排程系统,不是你。",
  gaugeBasis: "依据:FSRS true retention 范式——目标与实测对照,说明系统运转状况。",
  gaugeInsufficient: "数据还不够,系统先按默认节奏安排。",
  gaugeCalibrating: "排程系统正在校准——每次重逢都让它对你更准。",
  gaugeNormal: "排程系统运转正常。",
  settledTitle: "已长期掌握",
  settledHint: "这些内容已稳固,暂别复习;它们仍会在对话里自然出现。",
  settledEmpty: "还没有进入稳固区的内容。稳固需要时间,这里会慢慢长。",
  settledBasis: "依据:WaniKani Burn——用「暂别复习」的解放感作确认,最高级的已完成语言。",
  settledNodesLabel: "概念",
  settledWordsLabel: "词",
  settledShowMore: "展开全部",
  evidenceTitle: "证据可检视",
  evidenceHint: "系统对每个概念的判断,你都有权看见。",
  evidenceEmpty: "选一个概念,看它的判断由哪些证据构成。",
  evidenceBasis: "依据:开放学习者模型(Bull & Kay)——公开系统的判断,促进自我校准。",
  evidencePickerPlaceholder: "搜索已相遇的概念…",
  evidenceRetentionLabel: "当前保留率",
  evidenceRetentionUnknown: "暂无数据",
  evidenceEncountersLabel: "相遇记录",
  evidenceClaimsLabel: "掌握声明",
  evidenceClaimLearned: "自报:学过",
  evidenceClaimFamiliar: "自报:熟悉",
  evidenceClaimTaughtPrincipled: "回讲:讲到了原理",
  evidenceClaimTaughtSurface: "回讲:复述层面",
  trendsTitle: "趋势",
  trendsHint: "只与过去的自己比;不设目标线。",
  trendsBasis:
    "依据:累计量与可提取概率总和是文献与 Anki 社区验证的纵向形态;不做逐日正确率——当下表现不是长期学习的好指标(Soderstrom & Bjork 2015)。",
  trendsEmpty: "线条会随学习慢慢出现。",
  trendLayersTitle: "记忆 · 理解 · 直觉(估算)",
  trendLayersMemoryLabel: "记忆",
  trendLayersUnderstandingLabel: "理解",
  trendLayersIntuitionLabel: "直觉转化",
  trendLayersNote:
    "三条都是模型估算,按遗忘曲线随时间消退。记忆=估计还能想起的概念量;理解=有讲解或自报证据支撑的部分;直觉转化最粗略——长期稳定、且你在对话里自己用过的部分。",
  trendLayersBasis:
    "依据:Fitts & Posner 三阶段(认知/联结/自动化)+ ACT-R 陈述性→程序性;证据来自相遇足迹、回讲判读、自报与你自己的用词。",
  trendWordsTitle: "词汇(按记忆模型)",
  trendWordsSettledLabel: "稳定期超过一个月的词",
  trendWordsColdStartNote: "新词的稳定期长到一个月需要时间,这条线前段为 0 是正常的。",
  teachingModeTitle: "讲解模式记录",
  teachingModeEmpty: "还没有讲解模式的记录。在对话输入框上方可以切换讲法。",
  teachingModeBasis:
    "只是记录,不是评分。不同时间聊的内容不同,模式之间不能直接比出优劣;等积累够了,会在这里帮你一起看。",
} as const;

/** Continuity line for the heatmap: active-day and longest-run counts, plus the current
 * run only when it is at least 2 days — never mentions a gap or a break. */
export function continuityLine(
  activeDays: number,
  longestRunDays: number,
  currentRunDays: number,
): string {
  const base = `活跃 ${activeDays} 天 · 最长连续 ${longestRunDays} 天`;
  return currentRunDays >= 2 ? `${base} · 目前连续 ${currentRunDays} 天` : base;
}

/** Reunion module's headline: how many concepts are waiting, and how many the invite
 * list starts with. */
export function reunionLine(waitingCount: number, inviteCount: number): string {
  return `有 ${waitingCount} 个概念到了重逢的时候,从这 ${inviteCount} 个开始即可。`;
}

/** Reunion session opener — composed locally at creation time (zero LLM). Seeding the chat
 * with this assistant turn gives the model and the learner the same context: a purposeful
 * entry point must never land in a context-less conversation (Leo 2026-08-13). */
export function reunionOpener(title: string): string {
  return `这次来重逢「${title}」。先用自己的话说说你对它还有什么印象,从记得的部分开始就好;剩下的我来补。`;
}

/** Daily-bite progress line: complete state wins outright; zero progress states the
 * whole day's target; partial progress states what's done and what's left. */
export function dailyBiteLine(
  reunionsDone: number,
  newDone: number,
  reunionTarget: number,
  newTarget: number,
): string {
  const done = reunionsDone + newDone;
  const target = reunionTarget + newTarget;
  if (done >= target) return FEEDBACK_COPY.dailyBiteComplete;
  if (done === 0) return `今天的一份:重逢 ${reunionTarget} 个 + 新认识 ${newTarget} 个。`;
  return `已完成 ${done} · 还剩 ${target - done}。`;
}

/** System gauge's headline: target retention against the last-30-day measured rate,
 * both already expressed as whole-number percentages. */
export function gaugeLine(targetPercent: number, measuredPercent: number): string {
  return `目标记住率 ${targetPercent}%,近 30 天实测 ${measuredPercent}%。`;
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

/** Teaching-mode usage line: how many assistant turns used a given mode — a plain count,
 * never framed as one mode outperforming another. */
export function teachingModeLine(label: string, count: number): string {
  return `「${label}」讲了 ${count} 轮`;
}

/** Evidence section's per-claim label — which source produced the mastery claim. */
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
