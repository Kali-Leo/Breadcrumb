/**
 * Purpose: companion-cast safety module (spec 037) — the manipulation-lexicon gate applied to
 * all companion copy/cards, local crisis-keyword detection naming the out-of-persona response
 * to show instead, and a pure continuous-session break reminder. The responses themselves are
 * CopyMessages: this package decides *which* sentence applies, apps/desktop renders it (ADR-0031).
 * Main exports: MANIPULATION_LEXICON, containsManipulation, detectCrisis, CRISIS_RESPONSE,
 * shouldRemindBreak, BREAK_REMINDER_COPY, BREAK_REMINDER_INTERVAL_MS, nextBreakReminderAt,
 * COMPANION_COPY.
 */
import type { CopyMessage } from "@breadcrumb/core-i18n";

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

/** The plain, out-of-persona response shown instead of any companion reply once detectCrisis
 * fires — no role-play, states the limitation, points to offline crisis resources. Named
 * here, worded in chat.json under companion.crisisResponse (ADR-0031: packages carry no
 * wording), where locales/copyGate.test.ts scans it in every shipped language. */
export const CRISIS_RESPONSE: CopyMessage = { key: "chat:companion.crisisResponse" };

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

/** Shown once shouldRemindBreak fires. Worded in chat.json under companion.breakReminder. */
export const BREAK_REMINDER_COPY: CopyMessage = { key: "chat:companion.breakReminder" };

/** What is left here after the interface wording moved to the catalogues (ADR-0031): the
 * helper-name pool, which is content rather than copy. Everything the live UI renders is a
 * catalogue key now. */
export const COMPANION_COPY = {
  /** Daily helper roster (spec 050 §9): each helper is a peer who wants to understand one
   * concept — never a mentor, never above the learner. Helpers go by person names (Leo
   * 2026-08-16 — the messenger convention; the topic rides along as secondary text), picked
   * deterministically from the pool so the same helper always keeps the same name. */
  helperName: (topic: string): string =>
    HELPER_PERSON_NAMES[hashText(topic) % HELPER_PERSON_NAMES.length] as string,
} as const;

/** Everyday plants, animals and fruits (Leo 2026-08-16) — real, common, instantly
 * picturable; enough that three concurrent helpers rarely collide.
 * Content, not UI copy; localization deferred — these are the cast's names, and renaming a
 * cast is a content decision, not a translation. */
const HELPER_PERSON_NAMES = [
  "苹果",
  "柠檬",
  "山楂",
  "栗子",
  "银杏",
  "松果",
  "青梅",
  "枇杷",
  "海豚",
  "企鹅",
  "刺猬",
  "水獭",
  "狐狸",
  "松鼠",
  "白鹭",
  "河马",
  "橘子",
  "樱桃",
  "核桃",
  "蘑菇",
  "仙人掌",
  "小麦",
  "海豹",
  "麻雀",
] as const;

/** FNV-1a over UTF-16 code units — tiny, dependency-free, stable across sessions. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
