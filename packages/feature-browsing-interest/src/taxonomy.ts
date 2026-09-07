/**
 * Purpose: the 48 topics / 13 groups the classifier's output vector is indexed by, and the
 * nine-point emotion scale the panels colour by. These are data, not opinion: the index of a
 * topic in `TOPIC_LEAVES` IS its column in the weight matrix, so this order can never change
 * without retraining.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/taxonomy.json`, `interest-model/emotions.json`,
 * and the derived globals in `interest-model/daemon/app.py:28-33`), GPL-3.0, same copyright
 * holder; modified 2026-09-07 (JSON copied verbatim into ./data with a `_source` field added;
 * the flattening, the group lookup and the professional-topic set ported from app.py).
 *
 * Names are carried in the source language (Chinese) plus the English names the source files
 * already contained. Nothing here decides what a UI shows — `topicLabel` in ./topicNames does.
 * Main exports: TOPIC_LEAVES, TOPIC_GROUPS, groupOfTopic, PRO_TOPIC_INDICES, EMOTION_NAMES,
 * EMOTION_VALENCES.
 */
import emotions from "./data/emotions.json" with { type: "json" };
import taxonomy from "./data/taxonomy.json" with { type: "json" };

/** Group name → its leaf topics, in the order that defines the vector layout. */
export const TOPIC_GROUPS: Readonly<Record<string, readonly string[]>> = taxonomy.groups;

/** The 48 leaf topics, flattened in group order — index i is column i of the weight matrix. */
export const TOPIC_LEAVES: readonly string[] = Object.values(TOPIC_GROUPS).flat();

export const TOPIC_GROUP_NAMES_EN: Readonly<Record<string, string>> = taxonomy.groups_en;
export const TOPIC_LEAF_NAMES_EN: Readonly<Record<string, string>> = taxonomy.leaves_en;

const GROUP_OF_LEAF = new Map<string, string>();
for (const [group, leaves] of Object.entries(TOPIC_GROUPS))
  for (const leaf of leaves) GROUP_OF_LEAF.set(leaf, group);

/** The group a topic index belongs to, or "" for an index outside the taxonomy. */
export function groupOfTopic(index: number): string {
  const leaf = TOPIC_LEAVES[index];
  return leaf === undefined ? "" : (GROUP_OF_LEAF.get(leaf) ?? "");
}

/** English name for a leaf topic, falling back to the source name when none was provided. */
export function englishLeafName(leaf: string): string {
  return TOPIC_LEAF_NAMES_EN[leaf] ?? leaf;
}

/**
 * The four groups whose leaves count as "professional content" for the pro-content panel.
 * From app.py:32 — this set, not a per-leaf judgement, is what defines the panel's scope.
 */
export const PRO_GROUPS: readonly string[] = ["科技数码", "知识学习", "财经商业", "纪实深度"];

/** Topic indices belonging to `PRO_GROUPS`. */
export const PRO_TOPIC_INDICES: ReadonlySet<number> = new Set(
  PRO_GROUPS.flatMap((group) =>
    (TOPIC_GROUPS[group] ?? []).map((leaf) => TOPIC_LEAVES.indexOf(leaf)),
  ),
);

export const EMOTION_NAMES: readonly string[] = emotions.emotions.map((emotion) => emotion.name);
export const EMOTION_NAMES_EN: readonly string[] = emotions.emotions.map(
  (emotion) => emotion.name_en ?? emotion.name,
);
/** Valence of each emotion, −2..+2 — the y axis of the emotion curve. */
export const EMOTION_VALENCES: readonly number[] = emotions.emotions.map(
  (emotion) => emotion.valence,
);
export const EMOTION_COUNT = EMOTION_NAMES.length;
