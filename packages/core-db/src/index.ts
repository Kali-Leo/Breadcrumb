/**
 * Purpose: public entry of the data layer — row types, migrations, repositories.
 * The host app injects a SqlClient (tauri-plugin-sql); tests inject fakes.
 * Main exports: everything from types, migrations and repositories (core, knowledge, feature).
 */
export * from "./aiFailureRepositories";
export * from "./canonicalRepositories";
export * from "./channelStateRepositories";
export * from "./channelTypes";
export * from "./companionRepositories";
export * from "./companionTypes";
export * from "./comparisonRepositories";
export * from "./diglotRepositories";
export * from "./diglotTypes";
export * from "./discoveryRepositories";
export * from "./featureRepositories";
export * from "./focusRepositories";
export * from "./goalRepositories";
export * from "./interestRepositories";
export * from "./knowledgeRepositories";
export * from "./migrations";
export * from "./nodeEmbeddingRepository";
export * from "./nodeMergeRepository";
export * from "./practiceRepositories";
export * from "./repositories";
export * from "./researchRepositories";
export * from "./termMarksRepositories";
export * from "./transactionFallback";
export * from "./types";
