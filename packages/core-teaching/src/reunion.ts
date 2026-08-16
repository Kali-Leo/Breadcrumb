/**
 * Purpose: reunion-session helpers — the title prefix that marks a spaced-review chat and
 * the system line that turns it into retrieval practice instead of a re-lecture (spec 038
 * §2.4; evidence: retrieval > restudy, g=0.51–0.93, Adesope 2017).
 * Main exports: REUNION_TITLE_PREFIX, isReunionTitle, reunionTopicFromTitle,
 * buildReunionSystemLine.
 */

/** Marker a reunion session puts in the conversation title. The retired `重逢:` prefix stays
 * parseable so old conversations keep working (mirrors teachActions.ts's 换你讲·/回讲· pattern). */
export const REUNION_TITLE_PREFIX = "回顾:";
const LEGACY_REUNION_TITLE_PREFIX = "重逢:";

export function isReunionTitle(title: string): boolean {
  return title.startsWith(REUNION_TITLE_PREFIX) || title.startsWith(LEGACY_REUNION_TITLE_PREFIX);
}

export function reunionTopicFromTitle(title: string): string {
  if (title.startsWith(REUNION_TITLE_PREFIX)) return title.slice(REUNION_TITLE_PREFIX.length);
  return title.startsWith(LEGACY_REUNION_TITLE_PREFIX)
    ? title.slice(LEGACY_REUNION_TITLE_PREFIX.length)
    : title;
}

/** The retrieval-first instruction for a reunion round: ask before telling, cue before
 * re-explaining — the whole point of the FSRS-picked timing. */
export function buildReunionSystemLine(topic: string): string {
  return (
    `这次会话是对「${topic}」的间隔回访：先请对方凭记忆讲讲还记得什么，用一个具体的检索式问题开场；` +
    "等对方作答后再确认或补正。对方想不起来时，先给一点线索让对方再试一次，而不是直接重讲。"
  );
}
