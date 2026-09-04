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
  createNodePairVerdictsRepo,
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
  nodePairVerdicts: ReturnType<typeof createNodePairVerdictsRepo>;
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
  companionMemories: ReturnType<typeof createCompanionMemoriesRepo>;
  companionProposals: ReturnType<typeof createCompanionProposalsRepo>;
  companionKnowledgeState: ReturnType<typeof createCompanionKnowledgeStateRepo>;
  focusSessions: ReturnType<typeof createFocusSessionsRepo>;
  focusNodes: ReturnType<typeof createFocusNodesRepo>;
  termMarks: ReturnType<typeof createTermMarksRepo>;
}

let sqlClientPromise: Promise<SqlClient> | null = null;
let reposPromise: Promise<Repos> | null = null;

/** Remembers the result, and forgets it again the moment it fails. `??=` on its own caches a
 * REJECTED promise just as happily as a resolved one, so a single transient failure — the
 * database busy, a migration that met a locked file — would hand every later caller that same
 * stale error for the rest of the session and never open anything again. Clearing on failure
 * is what the rest of this app already does (apps/web/src/shims/embedding/embeddingWorker.ts). */
function memoize<T>(build: () => Promise<T>, forget: () => void): Promise<T> {
  return build().catch((error: unknown) => {
    forget();
    throw error;
  });
}

/** The raw SQL client — for the callers that need statements rather than repositories:
 * feature-research's executor (it builds its own research repo), and the demo-data seed the
 * guided tour installs and removes. */
export function getSqlClient(): Promise<SqlClient> {
  sqlClientPromise ??= memoize(openAndMigrate, () => {
    sqlClientPromise = null;
  });
  return sqlClientPromise;
}

export function getRepos(): Promise<Repos> {
  reposPromise ??= memoize(buildRepos, () => {
    reposPromise = null;
  });
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
    nodePairVerdicts: createNodePairVerdictsRepo(sqlClient),
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
    companionMemories: createCompanionMemoriesRepo(sqlClient),
    companionProposals: createCompanionProposalsRepo(sqlClient),
    companionKnowledgeState: createCompanionKnowledgeStateRepo(sqlClient),
    focusSessions: createFocusSessionsRepo(sqlClient),
    focusNodes: createFocusNodesRepo(sqlClient),
    termMarks: createTermMarksRepo(sqlClient),
  };
}

/** The key tauri-plugin-sql stores the connection pool under — an opaque handle, not a path.
 * Rust picks the actual file (src-tauri/src/open_database.rs) and registers the pool under
 * this key; execute_sql_transaction and the plugin's select/execute all look it up by it.
 *
 * The frontend deliberately cannot name a database file. The plugin's own `load` command
 * resolves a caller-supplied connection string against the app directory with PathBuf::push,
 * which an absolute path replaces outright — so with `sql:allow-load` granted, any script in
 * this webview could have opened and rewritten any SQLite file on the machine, browser
 * cookie stores included. `allow-load` is therefore not in the capability set. */
const DATABASE_URL = "sqlite:breadcrumb.db";

async function openAndMigrate(): Promise<SqlClient> {
  await invoke<string>("open_app_database");
  const database = await Database.get(DATABASE_URL);
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

/* No PRAGMAs are sent from here, and the two that used to be were not doing what their comment
 * claimed. They are per-connection settings, tauri-plugin-sql's pool holds up to ten
 * connections, and sqlx hands a connection back to the pool asynchronously — so two execute()
 * calls in a row land on two different connections and the statement after them on a third.
 * Measured 2026-09-03: `PRAGMA synchronous = NORMAL` sent from here armed one connection and
 * the very next statement still read FULL. Worse, the comment's premise was wrong in the other
 * direction too: the file was never in WAL mode (sqlx does not set journal_mode unless asked),
 * which is the one mode that makes NORMAL safe rather than corruption-on-power-loss.
 * Both now live in src-tauri/src/pragma_defaults.rs, applied through
 * SqlitePoolOptions::after_connect to every connection the pool opens. */
