/**
 * Purpose: assembles every core-db repository factory over one SqlClient, mirroring
 * apps/desktop/src/lib/db.ts's Repos shape headlessly (no Tauri) so the runner and judges
 * can use the exact same repo surface the app does.
 * Main exports: createSimlabRepos, SimlabRepos.
 */
import {
  createConversationsRepo,
  createFactcheckRepo,
  createGoalsRepo,
  createInterestSignalsRepo,
  createKnowledgeEdgesRepo,
  createKnowledgeNodesRepo,
  createLlmCallsRepo,
  createMapPlaceNamesRepo,
  createMasteryClaimsRepo,
  createMessagesRepo,
  createNodeEmbeddingsRepo,
  createNodeSightingsRepo,
  createSettingsRepo,
  createTrailSummariesRepo,
  type SqlClient,
} from "@breadcrumb/core-db";

export interface SimlabRepos {
  settings: ReturnType<typeof createSettingsRepo>;
  conversations: ReturnType<typeof createConversationsRepo>;
  messages: ReturnType<typeof createMessagesRepo>;
  llmCalls: ReturnType<typeof createLlmCallsRepo>;
  knowledgeNodes: ReturnType<typeof createKnowledgeNodesRepo>;
  nodeSightings: ReturnType<typeof createNodeSightingsRepo>;
  nodeEmbeddings: ReturnType<typeof createNodeEmbeddingsRepo>;
  knowledgeEdges: ReturnType<typeof createKnowledgeEdgesRepo>;
  trailSummaries: ReturnType<typeof createTrailSummariesRepo>;
  mapPlaceNames: ReturnType<typeof createMapPlaceNamesRepo>;
  factcheck: ReturnType<typeof createFactcheckRepo>;
  interestSignals: ReturnType<typeof createInterestSignalsRepo>;
  masteryClaims: ReturnType<typeof createMasteryClaimsRepo>;
  goals: ReturnType<typeof createGoalsRepo>;
}

export function createSimlabRepos(sql: SqlClient): SimlabRepos {
  return {
    settings: createSettingsRepo(sql),
    conversations: createConversationsRepo(sql),
    messages: createMessagesRepo(sql),
    llmCalls: createLlmCallsRepo(sql),
    knowledgeNodes: createKnowledgeNodesRepo(sql),
    nodeSightings: createNodeSightingsRepo(sql),
    nodeEmbeddings: createNodeEmbeddingsRepo(sql),
    knowledgeEdges: createKnowledgeEdgesRepo(sql),
    trailSummaries: createTrailSummariesRepo(sql),
    mapPlaceNames: createMapPlaceNamesRepo(sql),
    factcheck: createFactcheckRepo(sql),
    interestSignals: createInterestSignalsRepo(sql),
    masteryClaims: createMasteryClaimsRepo(sql),
    goals: createGoalsRepo(sql),
  };
}
