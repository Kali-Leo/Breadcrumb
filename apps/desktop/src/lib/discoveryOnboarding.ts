/**
 * Purpose: the first-run panel's material (spec 053 §6) — the dozen broad fields the reader takes
 * a position on before the first cards land, and the three positions themselves. Kept out of the
 * component so the fields and the cycle can be checked without a DOM.
 * Main exports: OnboardingStance, ONBOARDING_FIELDS, nextStance, stanceLabel.
 */

/** 想看 / 一般 / 不想看. 一般 is where every field starts: the reader is answering about
 * themselves before seeing anything, and "no opinion" is the honest default. */
export type OnboardingStance = "want" | "neutral" | "avoid";

/**
 * Broad enough that anyone recognizes themselves in a few of them, and each one works as a
 * search term on its own — these labels become the topics the first fetches go looking for.
 */
export const ONBOARDING_FIELDS: readonly string[] = [
  "编程与技术",
  "科学",
  "数学",
  "历史",
  "哲学",
  "心理学",
  "艺术与设计",
  "文学",
  "经济与商业",
  "语言",
  "健康",
  "社会与文化",
];

const STANCE_CYCLE: readonly OnboardingStance[] = ["neutral", "want", "avoid"];

/** One tap moves to the next position and wraps around, so every position is reachable without
 * a menu and nothing is ever stuck. */
export function nextStance(stance: OnboardingStance): OnboardingStance {
  const index = STANCE_CYCLE.indexOf(stance);
  return STANCE_CYCLE[(index + 1) % STANCE_CYCLE.length] ?? "neutral";
}

export function stanceLabel(stance: OnboardingStance): string {
  if (stance === "want") return "想看";
  if (stance === "avoid") return "不想看";
  return "一般";
}
