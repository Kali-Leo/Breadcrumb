/**
 * Purpose: stands in for apps/desktop/src/lib/db.ts inside the discovery journey harness — the
 * SAME repository factories the app builds, over a real migrated temp-file SQLite database
 * instead of tauri-plugin-sql. Test files hand this module to `vi.mock` for the desktop `./db`
 * specifier, so every discovery module under test (refill, landing, paging, the stores) reaches
 * genuine SQL rather than a hand-written fake.
 * Side effects: creates and deletes a temp .sqlite file; holds the open database in a
 * module-level slot because `getRepos()` takes no arguments in production either.
 * Main exports: openDiscoveryDatabase, closeDiscoveryDatabase, getRepos, getSqlClient.
 */
import {
  createAiFailuresRepo,
  createCanonicalRepo,
  createChannelStateRepo,
  createCompanionKnowledgeStateRepo,
  createCompanionMemoriesRepo,
  createCompanionProposalsRepo,
  createComparisonRepo,
  createConversationsRepo,
  createDiglotRepo,
  createDiscoveryRepo,
  createFactcheckRepo,
  createFocusNodesRepo,
  createFocusSessionsRepo,
  createGoalsRepo,
  createInterestSignalsRepo,
  createKnowledgeEdgesRepo,
  createKnowledgeNodesRepo,
  createLlmCallsRepo,
  createMapPlaceNamesRepo,
  createMasteryClaimsRepo,
  createMessagesRepo,
  createNodeAliasesRepo,
  createNodeEmbeddingsRepo,
  createNodeMergeRepo,
  createNodeSightingsRepo,
  createPracticeRepo,
  createResearchRepo,
  createSettingsRepo,
  createTermMarksRepo,
  createTrailSummariesRepo,
  type SqlClient,
} from "@breadcrumb/core-db";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";

/** Every repository apps/desktop/src/lib/db.ts assembles, built the same way. Typed
 * structurally rather than against the desktop `Repos` interface so this module never pulls
 * @tauri-apps type declarations into simlab's program. */
export function buildDesktopRepos(sql: SqlClient) {
  return {
    aiFailures: createAiFailuresRepo(sql),
    settings: createSettingsRepo(sql),
    conversations: createConversationsRepo(sql),
    messages: createMessagesRepo(sql),
    llmCalls: createLlmCallsRepo(sql),
    knowledgeNodes: createKnowledgeNodesRepo(sql),
    nodeSightings: createNodeSightingsRepo(sql),
    nodeEmbeddings: createNodeEmbeddingsRepo(sql),
    nodeAliases: createNodeAliasesRepo(sql),
    nodeMerge: createNodeMergeRepo(sql),
    knowledgeEdges: createKnowledgeEdgesRepo(sql),
    trailSummaries: createTrailSummariesRepo(sql),
    mapPlaceNames: createMapPlaceNamesRepo(sql),
    factcheck: createFactcheckRepo(sql),
    interestSignals: createInterestSignalsRepo(sql),
    masteryClaims: createMasteryClaimsRepo(sql),
    goals: createGoalsRepo(sql),
    comparisons: createComparisonRepo(sql),
    canonical: createCanonicalRepo(sql),
    channelState: createChannelStateRepo(sql),
    practice: createPracticeRepo(sql),
    diglot: createDiglotRepo(sql),
    discovery: createDiscoveryRepo(sql),
    research: createResearchRepo(sql),
    companionMemories: createCompanionMemoriesRepo(sql),
    companionProposals: createCompanionProposalsRepo(sql),
    companionKnowledgeState: createCompanionKnowledgeStateRepo(sql),
    focusSessions: createFocusSessionsRepo(sql),
    focusNodes: createFocusNodesRepo(sql),
    termMarks: createTermMarksRepo(sql),
  };
}

export type DesktopRepos = ReturnType<typeof buildDesktopRepos>;

interface OpenDatabase {
  temp: TempDatabase;
  repos: DesktopRepos;
}

let current: OpenDatabase | null = null;

/** Opens a fresh migrated database and points getRepos() at it. Every journey day, cold start
 * and hunting seed gets its own. */
export async function openDiscoveryDatabase(): Promise<OpenDatabase> {
  await closeDiscoveryDatabase();
  const temp = await createTempDatabase();
  current = { temp, repos: buildDesktopRepos(temp.sql) };
  return current;
}

export async function closeDiscoveryDatabase(): Promise<void> {
  current?.temp.close();
  current = null;
}

function requireOpen(): OpenDatabase {
  if (current === null) {
    throw new Error("discovery harness: openDiscoveryDatabase() was never called");
  }
  return current;
}

/** The two exports apps/desktop/src/lib/db.ts publishes; shapes match, so the mocked specifier
 * satisfies every importer. */
export async function getRepos(): Promise<DesktopRepos> {
  return requireOpen().repos;
}

export async function getSqlClient(): Promise<SqlClient> {
  return requireOpen().temp.sql;
}
