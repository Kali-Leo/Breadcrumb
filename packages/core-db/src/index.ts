/**
 * Purpose: public entry of the data layer — row types, migrations, repositories.
 * The host app injects a SqlClient (tauri-plugin-sql); tests inject fakes.
 * Main exports: everything from types, migrations and repositories (core, knowledge, feature).
 */
export * from "./aiFailureRepositories";
export * from "./aliasesRepository";
export * from "./canonicalRepositories";
export * from "./chatTypes";
export * from "./companionRepositories";
export * from "./companionTypes";
export * from "./comparisonRepositories";
export * from "./comparisonTypes";
export * from "./conversationsRepository";
export * from "./diglotRepositories";
export * from "./diglotTypes";
export * from "./edgesRepository";
export * from "./featureRepositories";
export * from "./featureTypes";
export * from "./focusRepositories";
export * from "./focusTypes";
export * from "./goalRepositories";
export * from "./interestRepositories";
export * from "./jsonColumns";
export * from "./knowledgeTypes";
export * from "./llmCallsRepository";
export * from "./messagesRepository";
export * from "./migrations";
export * from "./nodeEmbeddingRepository";
export * from "./nodeMergeRepository";
export * from "./nodePairVerdictRepository";
export * from "./nodesRepository";
export * from "./practiceRepositories";
export * from "./researchRepositories";
export * from "./researchTypes";
export * from "./settingsRepository";
export * from "./sightingsRepository";
export * from "./termMarksRepositories";
export * from "./transactionFallback";
export * from "./types";
