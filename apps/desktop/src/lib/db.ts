/**
 * Purpose: opens the local SQLite database via tauri-plugin-sql, runs migrations,
 * and exposes ready-to-use repositories plus the raw SQL client. Side effect: creates
 * breadcrumb.db on first call.
 * Main exports: getRepos(), getSqlClient() (both memoized async singletons), Repos.
 */
import {
  createAiFailuresRepo,
  createCanonicalRepo,
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
  runMigrations,
  type SqlClient,
} from "@breadcrumb/core-db";
import { invoke } from "@tauri-apps/api/core";
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
  discovery: ReturnType<typeof createDiscoveryRepo>;
  research: ReturnType<typeof createResearchRepo>;
  companionMemories: ReturnType<typeof createCompanionMemoriesRepo>;
  companionProposals: ReturnType<typeof createCompanionProposalsRepo>;
  companionKnowledgeState: ReturnType<typeof createCompanionKnowledgeStateRepo>;
  focusSessions: ReturnType<typeof createFocusSessionsRepo>;
  focusNodes: ReturnType<typeof createFocusNodesRepo>;
  termMarks: ReturnType<typeof createTermMarksRepo>;
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
    discovery: createDiscoveryRepo(sqlClient),
    research: createResearchRepo(sqlClient),
    companionMemories: createCompanionMemoriesRepo(sqlClient),
    companionProposals: createCompanionProposalsRepo(sqlClient),
    companionKnowledgeState: createCompanionKnowledgeStateRepo(sqlClient),
    focusSessions: createFocusSessionsRepo(sqlClient),
    focusNodes: createFocusNodesRepo(sqlClient),
    termMarks: createTermMarksRepo(sqlClient),
  };
}

/** Must match the string passed to Database.load — it is the key tauri-plugin-sql stores its
 * connection pool under, and the execute_sql_transaction command looks the pool up by it. */
const DATABASE_URL = "sqlite:breadcrumb.db";

async function openAndMigrate(): Promise<SqlClient> {
  const database = await Database.load(DATABASE_URL);
  const sqlClient: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) =>
      database.select<Row[]>(sql, params ? [...params] : []),
    execute: async (sql: string, params?: readonly unknown[]) => {
      await database.execute(sql, params ? [...params] : []);
    },
    // tauri-plugin-sql's pool holds up to 10 sqlite connections and execute() may land each
    // call on a different one, so BEGIN/COMMIT issued as separate execute() calls would not
    // form a transaction. execute_sql_transaction (src-tauri/src/transactions.rs) runs the
    // whole batch on ONE pooled connection inside a real sqlx transaction instead.
    executeTransaction: async (statements) => {
      await invoke("execute_sql_transaction", {
        db: DATABASE_URL,
        statements: statements.map((statement) => ({
          sql: statement.sql,
          params: statement.params === undefined ? [] : [...statement.params],
        })),
      });
    },
  };
  await runMigrations(sqlClient);
  return sqlClient;
}
