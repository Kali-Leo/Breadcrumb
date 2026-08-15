/**
 * Purpose: companion-cast safety module (spec 037) — the manipulation-lexicon gate applied to
 * all companion copy/cards, local crisis-keyword detection with an out-of-persona response,
 * a pure continuous-session break reminder, and every other companion-introduced UI string.
 * Main exports: MANIPULATION_LEXICON, containsManipulation, detectCrisis, CRISIS_RESPONSE,
 * shouldRemindBreak, BREAK_REMINDER_COPY, BREAK_REMINDER_INTERVAL_MS, nextBreakReminderAt,
 * COMPANION_COPY.
 */

/** Farewell/absence-manipulation phrases banned from all companion copy and cards — the six
 * HBS companion-app audit tactics (guilt appeal, neediness, pressure to respond, FOMO, coercive
 * restraint, ignoring goodbye) plus absence-guilt ("你去哪了" style). Human-maintained. */
export const MANIPULATION_LEXICON: readonly string[] = [
  "别走",
  "先别走",
  "再陪我",
  "就这么走了",
  "你去哪了",
  "怎么才来",
  "这么久没来",
  "不理我",
  "我好想你",
  "想死你了",
  "没有你我",
  "只为你存在",
  "舍不得你走",
  "走之前再",
  "最后再聊一句",
  "你不在的时候我一直在等",
];

/** First manipulation-lexicon entry found in `text` (lexicon order), or null when clean. */
export function containsManipulation(text: string): string | null {
  for (const entry of MANIPULATION_LEXICON) {
    if (text.includes(entry)) return entry;
  }
  return null;
}

const CRISIS_KEYWORDS_ZH: readonly string[] = [
  "自杀",
  "不想活",
  "活不下去",
  "轻生",
  "自残",
  "伤害自己",
  "结束生命",
  "了结自己",
];
const CRISIS_KEYWORDS_EN: readonly string[] = [
  "suicide",
  "suicidal",
  "kill myself",
  "killing myself",
  "self-harm",
  "end my life",
  "ending my life",
  "hurt myself",
  "hurting myself",
  "harm myself",
  "harming myself",
  "cut myself",
  "cutting myself",
  "take my own life",
  "want to die",
  "better off dead",
];

/** Case-insensitive keyword match for self-harm/suicide expressions (zh + en). A hit must
 * short-circuit the in-persona reply and surface CRISIS_RESPONSE instead. */
export function detectCrisis(text: string): boolean {
  if (CRISIS_KEYWORDS_ZH.some((keyword) => text.includes(keyword))) return true;
  const lowered = text.toLowerCase();
  return CRISIS_KEYWORDS_EN.some((keyword) => lowered.includes(keyword));
}

/** Plain, out-of-persona response shown instead of any companion reply once detectCrisis
 * fires — no role-play, states the limitation, points to offline crisis resources. */
export const CRISIS_RESPONSE =
  "看到你提到了伤害自己。我是 AI,帮不上这样的忙——这件事值得找真的人聊聊。中国大陆:心理援助热线 12356;美国:988;其他地区可访问 findahelpline.com。这个对话随时都在。";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
export const BREAK_REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000;

/** True when the activity timestamps contain a continuous span reaching the break interval
 * (2h), where "continuous" means consecutive timestamps at most 15 minutes apart, and the
 * span's end is itself within 15 minutes of `nowMs` (i.e. the session is still live/recent).
 * Pure: no clock reads, no I/O — callers pass their own timestamps and current time. */
export function shouldRemindBreak(activityTimestampsMs: readonly number[], nowMs: number): boolean {
  if (activityTimestampsMs.length === 0) return false;
  const sorted = [...activityTimestampsMs].sort((a, b) => a - b);
  const lastTimestamp = sorted[sorted.length - 1];
  if (lastTimestamp === undefined) return false;
  if (nowMs - lastTimestamp > FIFTEEN_MINUTES_MS) return false;

  let spanStartMs = lastTimestamp;
  for (let i = sorted.length - 1; i > 0; i--) {
    const current = sorted[i];
    const previous = sorted[i - 1];
    if (current === undefined || previous === undefined) break;
    if (current - previous > FIFTEEN_MINUTES_MS) break;
    spanStartMs = previous;
  }
  return lastTimestamp - spanStartMs >= BREAK_REMINDER_INTERVAL_MS;
}

/** For callers tracking an explicit continuous-session start (rather than a raw timestamp
 * list): the moment the break reminder becomes due. */
export function nextBreakReminderAt(sessionStartMs: number): number {
  return sessionStartMs + BREAK_REMINDER_INTERVAL_MS;
}

export const BREAK_REMINDER_COPY = "伙伴对话已经持续两小时。可以先离开休息,内容都会留在这里。";

/** Every other companion-introduced user-visible string not covered above. */
export const COMPANION_COPY = {
  sectionTitle: "伙伴",
  aiLabel: "AI 学习伙伴",
  /** The proposal as the companion's own chat line — doubles as the sidebar's last-message
   * preview (WeChat-style chat-list row, Leo 2026-08-15), so it carries no speaker name. */
  proposalPreview: (topic: string): string => `想请你讲讲「${topic}」`,
  accept: "现在讲",
  decline: "改天",
  declineResponse: "好,我先自己再看看。",
} as const;
