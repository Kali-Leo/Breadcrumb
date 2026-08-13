/**
 * Purpose: the "重逢邀请" module — the lowest-retention known concepts, framed as a minimal
 * restart rather than a deficit (Marlatt abstinence-violation-effect prevention, spec 035
 * #4).
 * Main exports: DEFAULT_REUNION_WAITING_THRESHOLD, ReunionInvite, pickReunionInvites.
 */

/** A node counts as "waiting" for reunion once its retention drops below 60% — comfortably
 * above FSRS's usual 0.5 near-forgetting mark, so the invite fires while recall is still an
 * easy nudge rather than a fresh relearn. */
export const DEFAULT_REUNION_WAITING_THRESHOLD = 0.6;

export interface ReunionInvite {
  nodeId: string;
  title: string;
  retention: number;
}

/** Every node whose retention is below `waitingThreshold` is "waiting"; `invites` is the
 * `limit` lowest-retention ones among them, lowest first. */
export function pickReunionInvites(
  retentionByNode: ReadonlyMap<string, number>,
  nodeTitles: ReadonlyMap<string, string>,
  options: { limit: number; waitingThreshold: number },
): { waitingCount: number; invites: ReunionInvite[] } {
  const waiting = [...retentionByNode.entries()]
    .filter(([, retention]) => retention < options.waitingThreshold)
    .sort((a, b) => a[1] - b[1]);

  const invites: ReunionInvite[] = waiting.slice(0, options.limit).map(([nodeId, retention]) => ({
    nodeId,
    title: nodeTitles.get(nodeId) ?? nodeId,
    retention,
  }));

  return { waitingCount: waiting.length, invites };
}
