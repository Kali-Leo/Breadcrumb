/**
 * Purpose: formats the per-round learner-context system message — anchored-node memory
 * state, explanation-style preferences, and the confusion downshift — so the contract's
 * "从对方当前的理解出发" has actual data behind it (spec 038 §2.3).
 * Main exports: LearnerContext, formatLearnerContextMessage.
 */

export interface LearnerContext {
  /** Label of the anchored knowledge node this round, if any. */
  anchoredNodeLabel?: string;
  /** FSRS-predicted retention for the anchored node, 0..1, if known. */
  retention?: number;
  /** True when the node has at least one principled-explanation mastery claim. */
  hasPrincipledMastery?: boolean;
  /** Top explanation styles this learner absorbs best (e.g. 类比, 代码示例), best first. */
  preferredStyles?: readonly string[];
  /** True when this round's user message tripped the confusion heuristic. */
  confusionDetected: boolean;
}

// Both numbers are PROVISIONAL AND UNSOURCED. The three-band stance they produce follows a
// real direction — the expertise reversal effect says assistance that helps a novice starts
// hurting once the learner has schemas of their own — but no literature gives a threshold
// with memory retention as the independent variable, so 0.4 and 0.7 were picked by hand, not
// derived. They are placeholders to be calibrated against this app's own data; do not cite
// them as findings and do not build anything that assumes they are exact.

/** Node labels and style tags are free text an extractor model wrote out of the learner's
 * own conversation, and this message goes in as a *system* message — so nothing is
 * interpolated raw. Newlines fold away (no forged sections), the quoting brackets this file
 * uses to delimit a label are dropped (no forged delimiters), and a long one is cut: a label
 * is a short name, and 24 code points is more than any real one needs. */
const MAX_INTERPOLATED_LENGTH = 24;

function sanitize(text: string): string {
  const folded = text
    .replace(/\s+/g, " ")
    .replace(/[「」【】]/g, "")
    .trim();
  return Array.from(folded).slice(0, MAX_INTERPOLATED_LENGTH).join("");
}

/** Retention below this: teach directly from basics, small steps. Provisional, see above. */
const LOW_RETENTION_CEILING = 0.4;
/** Retention above this: skip basics, drop assistance. Provisional, see above. */
const HIGH_RETENTION_FLOOR = 0.7;

function retentionStanceLine(label: string, retention: number, principled: boolean): string {
  const percent = Math.round(retention * 100);
  const evidence = principled ? "，此前有讲出原理的记录" : "";
  if (retention >= HIGH_RETENTION_FLOOR)
    return `- 「${label}」的记忆保留率约 ${percent}%${evidence}——跳过基础复述，从应用或更深一层讲起，少给辅助。`;
  if (retention < LOW_RETENTION_CEILING)
    return `- 「${label}」的记忆保留率约 ${percent}%${evidence}——从基础直接讲起，小步推进，多给完整示例。`;
  return `- 「${label}」的记忆保留率约 ${percent}%${evidence}——处在半生不熟的区间，适合先让对方试一步再补讲。`;
}

/**
 * Returns the learner-context system message content, or null when there is nothing
 * worth injecting — an empty context must not produce an empty-shell message.
 */
export function formatLearnerContextMessage(context: LearnerContext): string | null {
  const lines: string[] = [];
  if (
    context.anchoredNodeLabel !== undefined &&
    context.retention !== undefined &&
    Number.isFinite(context.retention)
  ) {
    lines.push(
      retentionStanceLine(
        sanitize(context.anchoredNodeLabel),
        Math.min(1, Math.max(0, context.retention)),
        context.hasPrincipledMastery === true,
      ),
    );
  }
  if (context.preferredStyles !== undefined && context.preferredStyles.length > 0) {
    const styles = context.preferredStyles
      .slice(0, 3)
      .map(sanitize)
      .filter((style) => style.length > 0);
    if (styles.length > 0) lines.push(`- 对方更容易吸收的讲解方式：${styles.join("、")}。`);
  }
  if (context.confusionDetected) {
    lines.push(
      "- 本轮对方表示没有听懂：换一种讲法重来，放低一个台阶，把困难归因于材料本身；不要重复原来的说法。",
    );
  }
  if (lines.length === 0) return null;
  return `学情参考（只用于调整讲法，不要向对方复述这些数字）：\n${lines.join("\n")}`;
}
