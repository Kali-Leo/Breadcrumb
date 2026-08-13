/**
 * Purpose: opens the local SQLite database via tauri-plugin-sql, runs migrations,
 * and exposes ready-to-use repositories plus the raw SQL client. Side effect: creates
 * breadcrumb.db on first call.
 * Main exports: getRepos(), getSqlClient() (both memoized async singletons), Repos.
 */
import {
  createAiFailuresRepo,
  createCanonicalRepo,
  createComparisonRepo,
  createConversationsRepo,
  createDiglotRepo,
  createFactcheckRepo,
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
  createTrailSummariesRepo,
  runMigrations,
  type SqlClient,
} from "@breadcrumb/core-db";
import Database from "@tauri-apps/plugin-sql";

export interface Repos {
  aiFailures: ReturnType<typeof createAiFailuresRepo>;
  settings: ReturnType<typeof createSettingsRepo>;
  conversations: ReturnType<typeof createConversationsRepo>;
  messages: ReturnType<typeof createMessagesRepo>;
  llmCalls: ReturnType<typeof createLlmCallsRepo>;
  knowledgeNodes: ReturnType<typeof createKnowledgeNodesRepo>;
  nodeSightings: ReturnType<typeof createNodeSightingsRepo>;
  nodeEmbeddings: ReturnType<typeof createNodeEmbeddingsRepo>;
  nodeAliases: ReturnType<typeof createNodeAliasesRepo>;
  nodeMerge: ReturnType<typeof createNodeMergeRepo>;
  knowledgeEdges: ReturnType<typeof createKnowledgeEdgesRepo>;
  trailSummaries: ReturnType<typeof createTrailSummariesRepo>;
  mapPlaceNames: ReturnType<typeof createMapPlaceNamesRepo>;
  factcheck: ReturnType<typeof createFactcheckRepo>;
  interestSignals: ReturnType<typeof createInterestSignalsRepo>;
  masteryClaims: ReturnType<typeof createMasteryClaimsRepo>;
  goals: ReturnType<typeof createGoalsRepo>;
  comparisons: ReturnType<typeof createComparisonRepo>;
  canonical: ReturnType<typeof createCanonicalRepo>;
  practice: ReturnType<typeof createPracticeRepo>;
  diglot: ReturnType<typeof createDiglotRepo>;
  research: ReturnType<typeof createResearchRepo>;
}

let sqlClientPromise: Promise<SqlClient> | null = null;
let reposPromise: Promise<Repos> | null = null;

/** The raw SQL client — needed by @breadcrumb/plugin-research's executor, which takes a
 * SqlClient directly rather than a Repos bundle (it builds its own research repo). */
export function getSqlClient(): Promise<SqlClient> {
  sqlClientPromise ??= openAndMigrate();
  return sqlClientPromise;
}

export function getRepos(): Promise<Repos> {
  reposPromise ??= buildRepos();
  return reposPromise;
}

async function buildRepos(): Promise<Repos> {
  const sqlClient = await getSqlClient();
  return {
    aiFailures: createAiFailuresRepo(sqlClient),
    settings: createSettingsRepo(sqlClient),
    conversations: createConversationsRepo(sqlClient),
    messages: createMessagesRepo(sqlClient),
    llmCalls: createLlmCallsRepo(sqlClient),
    knowledgeNodes: createKnowledgeNodesRepo(sqlClient),
    nodeSightings: createNodeSightingsRepo(sqlClient),
    nodeEmbeddings: createNodeEmbeddingsRepo(sqlClient),
    nodeAliases: createNodeAliasesRepo(sqlClient),
    nodeMerge: createNodeMergeRepo(sqlClient),
    knowledgeEdges: createKnowledgeEdgesRepo(sqlClient),
    trailSummaries: createTrailSummariesRepo(sqlClient),
    mapPlaceNames: createMapPlaceNamesRepo(sqlClient),
    factcheck: createFactcheckRepo(sqlClient),
    interestSignals: createInterestSignalsRepo(sqlClient),
    masteryClaims: createMasteryClaimsRepo(sqlClient),
    goals: createGoalsRepo(sqlClient),
    comparisons: createComparisonRepo(sqlClient),
    canonical: createCanonicalRepo(sqlClient),
    practice: createPracticeRepo(sqlClient),
    diglot: createDiglotRepo(sqlClient),
    research: createResearchRepo(sqlClient),
  };
}

async function openAndMigrate(): Promise<SqlClient> {
  const database = await Database.load("sqlite:breadcrumb.db");
  const sqlClient: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) =>
      database.select<Row[]>(sql, params ? [...params] : []),
    execute: async (sql: string, params?: readonly unknown[]) => {
      await database.execute(sql, params ? [...params] : []);
    },
  };
  await runMigrations(sqlClient);
  return sqlClient;
}
