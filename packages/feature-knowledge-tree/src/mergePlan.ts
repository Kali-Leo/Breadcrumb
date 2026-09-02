/**
 * Purpose: spec 015 #4's auto-merge-duplicates planning — pure logic only. normalizeLabel
 * collapses cosmetic label variants (whitespace, full/half-width, a trailing parenthetical,
 * latin case) to one comparison key; planMechanicalMerges groups existing nodes by that key
 * (zero LLM, zero risk); planSynonymVerdictMerges turns embedding-similar existing-node pairs
 * the synonym-judge LLM called "同一" into the same merge-instruction shape. Both planners
 * pick the earliest-created node in a pair/group as canonical. Execution contract: each
 * NodeMergeInstruction is carried out by core-db's createNodeMergeRepo(sql).mergeNode —
 * reassigns sightings/edges(dedup+confidence)/interest_signals/mastery_claims/node_aliases/
 * children to canonicalId, records duplicateLabel as an alias of canonicalId, then deletes
 * the duplicate node row and its embedding.
 * Main exports: normalizeLabel, NodeMergeInstruction, planMechanicalMerges, JudgedNodePair,
 * planSynonymVerdictMerges.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { SynonymVerdict } from "./synonymGate";

/** Whitespace sitting between a CJK character and a latin letter/digit, on either side. Only
 * that boundary is folded: whether "if缩进" is written "if 缩进" is pure typography (writers
 * add the space for legibility, CJK needs none), while whitespace between two latin words is
 * meaningful and must stay. Design audit 2026-08-28 #9. */
const CJK_LATIN_SPACE =
  /(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu;

/** Collapses cosmetic label variants to one comparison key: trims, folds full-width
 * latin/punctuation to half-width (NFKC — also unifies full/half-width parentheses so the
 * trailing-parenthetical strip below matches either), drops ONE trailing "(...)" annotation
 * (e.g. a romanization or translation), removes the optional space at a CJK/latin boundary,
 * then lowercases latin letters. Not exhaustive synonym detection — that's the embedding+LLM
 * tier; this only catches typographic near-duplicates of the same label.
 *
 * Traditional->simplified folding is NOT done here: it needs a character mapping table, and
 * as of 2026-08-28 no npm package offers one that is at once small enough, cleanly licensed
 * AND still maintained (the two small ones were last published in 2012 and 2017). So
 * 財務報表 and 财务报表 still read as different labels; the embedding tier is what catches
 * them today. */
export function normalizeLabel(label: string): string {
  const widthUnified = label.trim().normalize("NFKC");
  const withoutTrailingParenthetical = stripOneTrailingParenthetical(widthUnified).trim();
  return withoutTrailingParenthetical.replace(CJK_LATIN_SPACE, "").toLowerCase();
}

function stripOneTrailingParenthetical(text: string): string {
  const match = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (match === null) return text;
  const remainder = (match[1] ?? "").trim();
  // A label that's nothing but a parenthetical (rare, malformed) keeps its full text rather
  // than normalizing to an empty string.
  return remainder.length > 0 ? remainder : text;
}

/** The earliest-created of two nodes sorts first (canonical); ties break on id for a total,
 * deterministic order regardless of input array order. */
function compareCanonicalOrder(a: KnowledgeNodeRow, b: KnowledgeNodeRow): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** One duplicate node folding into its canonical — the unit both planners emit and
 * createNodeMergeRepo.mergeNode executes. */
export interface NodeMergeInstruction {
  canonicalId: string;
  duplicateId: string;
  duplicateLabel: string;
}

/** Groups nodes by normalizeLabel(label); within a group of 2+, the earliest-created node is
 * canonical and every other member becomes a merge instruction into it. Groups of 1 (no
 * duplicate) are skipped. Deterministic: given the same node set, always the same
 * instructions in the same order, independent of input array order. */
export function planMechanicalMerges(nodes: readonly KnowledgeNodeRow[]): NodeMergeInstruction[] {
  const groups = new Map<string, KnowledgeNodeRow[]>();
  for (const node of nodes) {
    const key = normalizeLabel(node.label);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [node]);
    } else {
      group.push(node);
    }
  }

  const instructions: NodeMergeInstruction[] = [];
  for (const [, members] of [...groups.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (members.length < 2) continue;
    const sorted = [...members].sort(compareCanonicalOrder);
    const canonical = sorted[0];
    if (canonical === undefined) continue; // unreachable: members.length >= 2
    for (const duplicate of sorted.slice(1)) {
      instructions.push({
        canonicalId: canonical.id,
        duplicateId: duplicate.id,
        duplicateLabel: duplicate.label,
      });
    }
  }
  return instructions;
}

/** One embedding-similar existing-node pair sent to the synonym-judge LLM, identified by the
 * same opaque pairId the batch's verdicts echo back. */
export interface JudgedNodePair {
  pairId: string;
  nodeAId: string;
  nodeBId: string;
}

/** Turns "same"-verdict pairs into merge instructions (earliest-created wins), skipping any
 * pair once either side has already been folded away earlier in this same batch — a node
 * deleted by an earlier instruction must not be referenced again; a chain (A~B, B~C) leaves
 * the second pair for a later sweep, once B's survivor (A) can be re-compared against C. A
 * verdict with an unknown pairId, or "different", contributes nothing. */
export function planSynonymVerdictMerges(
  pairs: readonly JudgedNodePair[],
  verdicts: readonly { pairId: string; verdict: SynonymVerdict }[],
  nodesById: ReadonlyMap<string, KnowledgeNodeRow>,
): NodeMergeInstruction[] {
  const pairById = new Map(pairs.map((pair) => [pair.pairId, pair]));
  const alreadyMergedAway = new Set<string>();
  const instructions: NodeMergeInstruction[] = [];

  for (const verdict of verdicts) {
    if (verdict.verdict !== "same") continue;
    const pair = pairById.get(verdict.pairId);
    if (pair === undefined) continue;
    if (alreadyMergedAway.has(pair.nodeAId) || alreadyMergedAway.has(pair.nodeBId)) continue;
    const nodeA = nodesById.get(pair.nodeAId);
    const nodeB = nodesById.get(pair.nodeBId);
    if (nodeA === undefined || nodeB === undefined) continue;

    const [canonical, duplicate] =
      compareCanonicalOrder(nodeA, nodeB) <= 0 ? [nodeA, nodeB] : [nodeB, nodeA];
    instructions.push({
      canonicalId: canonical.id,
      duplicateId: duplicate.id,
      duplicateLabel: duplicate.label,
    });
    alreadyMergedAway.add(duplicate.id);
  }
  return instructions;
}
