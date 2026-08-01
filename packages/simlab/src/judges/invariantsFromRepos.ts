/**
 * Purpose: DB-facing wrapper around the pure invariants module — builds an InvariantInput
 * from a journey's own repos via the same PlannerSnapshot the follow-frontier action and day
 * digest use, then runs the tripwire suite. This is what journey.ts's onConversationComplete
 * hook calls after every conversation.
 * Main exports: runInvariantsFromRepos.
 */
import { LIT_THRESHOLD } from "@breadcrumb/plugin-memory";
import type { SimlabRepos } from "../db/repos";
import { computePlannerSnapshot } from "../runner/plannerSnapshot";
import { runInvariants, type Violation } from "./invariants";

export async function runInvariantsFromRepos(
  repos: SimlabRepos,
  nowIso: string,
): Promise<Violation[]> {
  const snapshot = await computePlannerSnapshot(repos, nowIso);
  const goals = await repos.goals.listAll();
  return runInvariants({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    masteryByNode: snapshot.masteryByNode,
    interestByNode: snapshot.interestByNode,
    frontierCandidates: snapshot.frontierCandidates,
    goals,
    litThreshold: LIT_THRESHOLD,
  });
}
