/**
 * Purpose: opens the local SQLite database via tauri-plugin-sql, runs migrations,
 * and exposes ready-to-use repositories. Side effect: creates breadcrumb.db on first call.
 * Main exports: getRepos() (memoized async singleton), Repos.
 */
import {
  createConversationsRepo,
  createKnowledgeNodesRepo,
  createLlmCallsRepo,
  createMessagesRepo,
  createNodeEmbeddingsRepo,
  createNodeSightingsRepo,
  createSettingsRepo,
  createTrailSummariesRepo,
  runMigrations,
  type SqlClient,
} from "@breadcrumb/core-db";
import Database from "@tauri-apps/plugin-sql";

export interface Repos {
  settings: ReturnType<typeof createSettingsRepo>;
  conversations: ReturnType<typeof createConversationsRepo>;
  messages: ReturnType<typeof createMessagesRepo>;
  llmCalls: ReturnType<typeof createLlmCallsRepo>;
  knowledgeNodes: ReturnType<typeof createKnowledgeNodesRepo>;
  nodeSightings: ReturnType<typeof createNodeSightingsRepo>;
  nodeEmbeddings: ReturnType<typeof createNodeEmbeddingsRepo>;
  trailSummaries: ReturnType<typeof createTrailSummariesRepo>;
  mapPlaceNames: ReturnType<typeof createMapPlaceNamesRepo>;
}

let reposPromise: Promise<Repos> | null = null;

export function getRepos(): Promise<Repos> {
  reposPromise ??= openAndMigrate();
  return reposPromise;
}

async function openAndMigrate(): Promise<Repos> {
  const database = await Database.load("sqlite:breadcrumb.db");
  const sqlClient: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) =>
      database.select<Row[]>(sql, params ? [...params] : []),
    execute: async (sql: string, params?: readonly unknown[]) => {
      await database.execute(sql, params ? [...params] : []);
    },
  };
  await runMigrations(sqlClient);
  return {
    settings: createSettingsRepo(sqlClient),
    conversations: createConversationsRepo(sqlClient),
    messages: createMessagesRepo(sqlClient),
    llmCalls: createLlmCallsRepo(sqlClient),
    knowledgeNodes: createKnowledgeNodesRepo(sqlClient),
    nodeSightings: createNodeSightingsRepo(sqlClient),
    nodeEmbeddings: createNodeEmbeddingsRepo(sqlClient),
    trailSummaries: createTrailSummariesRepo(sqlClient),
    mapPlaceNames: createMapPlaceNamesRepo(sqlClient),
  };
}
