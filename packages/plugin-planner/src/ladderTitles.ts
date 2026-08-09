/**
 * Purpose: pure title engine for the ranked ladder (spec 021) — maps the internal rank scalar
 * (rankEngine, kept but never shown) onto a 19-step game-convention title ladder: six tiers
 * split III→II→I plus an undivided top tier. Thresholds sit on ln(start/rank), which is linear
 * in domain fuel, with geometrically growing gaps: early titles arrive fast, later ones slowly.
 * Main exports: LADDER_TITLE_TIERS, LadderTitle, titleFromRank, nextTitleLabel,
 * TITLE_STEP_COUNT, TITLE_THRESHOLD_GROWTH.
 */

/** Worst to best. The names follow the mainstream game-rank convention on purpose (no invented
 * measure words); they are a placeholder convention Leo can rename in one place. */
export const LADDER_TITLE_TIERS = ["青铜", "白银", "黄金", "铂金", "钻石", "大师", "王者"] as const;

/** Divisions per tier below the top: III (entry) → II → I (about to promote). */
const DIVISIONS_PER_TIER = 3;
/** 6 divided tiers × 3 + undivided 王者. */
export const TITLE_STEP_COUNT = (LADDER_TITLE_TIERS.length - 1) * DIVISIONS_PER_TIER + 1;
/** Step i (0-based) unlocks at ln(start/rank) ≥ TITLE_THRESHOLD_GROWTH^i − 1 — a closed form
 * for geometrically growing gaps. With rankEngine's β=0.035 that is ≈3 fuel for the first
 * promotion and ≈130 total fuel for 王者, mirroring "harder the closer to the top". */
export const TITLE_THRESHOLD_GROWTH = 1.1;

export interface LadderTitle {
  /** 0-based position on the 19-step ladder, monotone in fuel. */
  step: number;
  tier: (typeof LADDER_TITLE_TIERS)[number];
  /** 3=III, 2=II, 1=I; null for the undivided top tier. */
  division: number | null;
  /** Display form, e.g. "黄金 II" or "王者". */
  label: string;
}

const ROMAN_BY_DIVISION: Record<number, string> = { 1: "I", 2: "II", 3: "III" };

function titleFromStep(step: number): LadderTitle {
  const clamped = Math.max(0, Math.min(TITLE_STEP_COUNT - 1, step));
  const tierIndex = Math.floor(clamped / DIVISIONS_PER_TIER);
  const tier = LADDER_TITLE_TIERS[tierIndex] as (typeof LADDER_TITLE_TIERS)[number];
  if (tierIndex === LADDER_TITLE_TIERS.length - 1) {
    return { step: clamped, tier, division: null, label: tier };
  }
  const division = DIVISIONS_PER_TIER - (clamped % DIVISIONS_PER_TIER);
  return { step: clamped, tier, division, label: `${tier} ${ROMAN_BY_DIVISION[division]}` };
}

/**
 * The learner's current title from the shown rank (resolveShownRank's output) and the goal's
 * start rank. Progress axis is ln(start/rank): 0 at the start rank, linear in fuel, so the
 * title inherits the rank's guarantees — never drops while learning, bounded slip after a
 * long absence (a 10% rank slip is ≈0.095 on this axis, at most one early step).
 */
export function titleFromRank(shownRank: number, startRankValue: number): LadderTitle {
  const safeRank = Math.max(1, Math.min(startRankValue, shownRank));
  const progress = Math.log(startRankValue / safeRank);
  let step = 0;
  while (step + 1 < TITLE_STEP_COUNT && progress >= TITLE_THRESHOLD_GROWTH ** (step + 1) - 1) {
    step += 1;
  }
  return titleFromStep(step);
}

/** The label one step up — the hook line's target — or null when already at the top. */
export function nextTitleLabel(current: LadderTitle): string | null {
  if (current.step >= TITLE_STEP_COUNT - 1) return null;
  return titleFromStep(current.step + 1).label;
}
