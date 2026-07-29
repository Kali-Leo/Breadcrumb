/**
 * Purpose: public entry of the data layer — row types, migrations, repositories.
 * The host app injects a SqlClient (tauri-plugin-sql); tests inject fakes.
 * Main exports: everything from types, migrations and repositories.
 */
export * from "./migrations";
export * from "./repositories";
export * from "./types";
