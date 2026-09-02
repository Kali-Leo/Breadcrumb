/**
 * Purpose: the daily helper gate behind companionStore (spec 050 §9) — expiring yesterday's
 * leftovers, turning the concepts a review would help most into today's help-seeking
 * characters, and the day-change / switch-toggle triggers that re-run it. Split out of
 * companionStore.ts purely to keep that file under the file-size ceiling; it takes the
 * re-run callback as a parameter (like plannerStoreEvents) so it has no dependency back on
 * the store file.
 * Side effects: DB writes on the gate run (expiring and inserting companion_proposals rows,
 * creating each helper's conversation).
 * Main exports: HELPER_ID_PREFIX, runDailyHelperGate, wireDailyHelperGateTriggers.
 */
import type { CompanionProposalRow } from "@breadcrumb/core-db";
import { useChatStore } from "../../stores/chatStore";
import { useKnowledgeStore } from "../../stores/knowledgeStore";
import { useMemoryStore } from "../../stores/memoryStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { getRepos } from "../platform/db";
import { newId, nowIso, onLocalDayChange, todayLocalMidnightIso } from "../platform/time";
import { startHelperConversation } from "./companionHelperConversation";
import { pickTeachCandidates } from "./teachActions";

export const HELPER_ID_PREFIX = "helper-";
const DAILY_HELPER_LIMIT = 3;
/** A concept that had a helper within this window doesn't get another one yet. */
const HELPER_REPEAT_COOLDOWN_DAYS = 7;
const LOOKBACK_MS = 30 * 24 * 3_600_000;

/** Serializes overlapping gate runs (StrictMode double-mount, bus bursts). */
let gateRunInFlight = false;
/** Guards the day-change/switch-toggle re-gate wiring below against being registered twice
 * (StrictMode double-invokes initialize()) — module scope survives both invocations. */
let dailyGateTriggersWired = false;

/** Re-runs the daily-helper gate when the local day rolls over (an app left open across
 * midnight must not keep yesterday's roster until restart) and when the companionChat
 * switch flips off→on (toggling it back on must not leave helpers empty until restart).
 * Wired once per module lifetime from initialize(). */
export function wireDailyHelperGateTriggers(refreshDailyHelpers: () => void): void {
  if (dailyGateTriggersWired) return;
  dailyGateTriggersWired = true;
  onLocalDayChange(() => {
    refreshDailyHelpers();
  });
  let previousCompanionChatEnabled = useSettingsStore.getState().featureSwitches.companionChat;
  useSettingsStore.subscribe((state) => {
    const enabled = state.featureSwitches.companionChat;
    if (enabled && !previousCompanionChatEnabled) {
      refreshDailyHelpers();
    }
    previousCompanionChatEnabled = enabled;
  });
}

/** Runs the gate once and returns today's pending roster, or null when another run is
 * already in flight — the caller then leaves the roster it already has untouched. */
export async function runDailyHelperGate(): Promise<CompanionProposalRow[] | null> {
  if (gateRunInFlight) return null;
  gateRunInFlight = true;
  try {
    const repos = await getRepos();
    const now = nowIso();
    const todayStart = todayLocalMidnightIso();
    const sinceIso = new Date(Date.parse(now) - LOOKBACK_MS).toISOString();
    const rows = await repos.companionProposals.listRecent(sinceIso);

    // Yesterday's unhandled helpers leave quietly — tomorrow is a fresh page.
    for (const row of rows) {
      if (row.status === "pending" && row.created_at < todayStart) {
        await repos.companionProposals.resolve(row.id, "expired", now);
      }
    }

    const todays = rows.filter((row) => row.created_at >= todayStart);
    if (todays.length === 0) {
      await useMemoryStore.getState().refresh();
      const nodes = useKnowledgeStore.getState().nodes;
      const reviewPriorityByNode = useMemoryStore.getState().reviewPriorityByNode;
      const cooldownStart = new Date(
        Date.parse(todayStart) - HELPER_REPEAT_COOLDOWN_DAYS * 24 * 3_600_000,
      ).toISOString();
      const recentNodeIds = new Set(
        rows.filter((row) => row.created_at >= cooldownStart).map((row) => row.node_id),
      );
      const candidates = pickTeachCandidates(nodes, reviewPriorityByNode, DAILY_HELPER_LIMIT * 2)
        .filter((node) => !recentNodeIds.has(node.id))
        .slice(0, DAILY_HELPER_LIMIT);
      for (const node of candidates) {
        const helperId = `${HELPER_ID_PREFIX}${node.id}`;
        await startHelperConversation(helperId, node.label);
        const row: CompanionProposalRow = {
          id: newId(),
          companion_id: helperId,
          node_id: node.id,
          topic: node.label,
          kind: "teach",
          status: "pending",
          created_at: nowIso(),
          resolved_at: null,
        };
        await repos.companionProposals.insert(row);
        todays.push(row);
      }
      if (candidates.length > 0) await useChatStore.getState().loadFromDatabase();
    }

    return todays.filter((row) => row.status === "pending");
  } finally {
    gateRunInFlight = false;
  }
}
