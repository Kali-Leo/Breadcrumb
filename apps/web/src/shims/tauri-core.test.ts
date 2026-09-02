/**
 * Purpose: locks down the invoke dispatch table. Every Rust command the desktop app can call
 * either has an answer here or an honest refusal, and nothing in the type system says so — a
 * new command on the desktop side lands in `default:` and degrades silently forever.
 *
 * One case per command, so adding a command without deciding what the browser does about it
 * shows up as a failing test rather than as a feature that quietly does nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.fn();
const exportDatabaseFile = vi.fn();
const importDatabaseFile = vi.fn();
const openBrowserDatabase = vi.fn(async () => ({ transaction }));
const embedTextsInBrowser = vi.fn();

vi.mock("./sqlite", () => ({
  openBrowserDatabase: () => openBrowserDatabase(),
  exportDatabaseFile: () => exportDatabaseFile(),
  importDatabaseFile: (bytes: Uint8Array) => importDatabaseFile(bytes),
}));
vi.mock("./embeddings", () => ({
  embedTextsInBrowser: (texts: string[], allow: boolean) => embedTextsInBrowser(texts, allow),
}));

const { invoke } = await import("./tauri-core");

/** The commands with no browser answer. Each one already degrades on the desktop side, so a
 * rejection lands where a failed native call lands. */
const REFUSED = [
  "optimize_fsrs_parameters",
  "piper_synthesize",
  "start_interest_service",
  "read_interest_service_token",
  // A command nobody has written a browser answer for must not resolve with a plausible value.
  "some_command_added_to_rust_tomorrow",
];

describe("what the browser answers when the app calls a Rust command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the database and names it the way the SQL plugin expects", async () => {
    await expect(invoke("open_app_database")).resolves.toBe("sqlite:breadcrumb.db");
    expect(openBrowserDatabase).toHaveBeenCalledOnce();
  });

  it("passes a transaction's statements through to the database", async () => {
    const statements = [{ sql: "INSERT INTO t VALUES (?)", params: [1] }];
    await invoke("execute_sql_transaction", { statements });
    expect(transaction).toHaveBeenCalledWith(statements);
  });

  it("exports the whole database file", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    exportDatabaseFile.mockResolvedValue(bytes);
    await expect(invoke("export_database")).resolves.toBe(bytes);
  });

  it("imports a database file", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    await invoke("import_database", { bytes });
    expect(importDatabaseFile).toHaveBeenCalledWith(bytes);
  });

  it("hands embedding requests to the browser implementation", async () => {
    embedTextsInBrowser.mockResolvedValue([[0.1]]);
    await expect(invoke("embed_texts", { texts: ["a"], allowDownload: true })).resolves.toEqual([
      [0.1],
    ]);
    expect(embedTextsInBrowser).toHaveBeenCalledWith(["a"], true);
  });

  it.each(REFUSED)("refuses %s by name", async (command) => {
    await expect(invoke(command)).rejects.toMatchObject({
      name: "UnavailableInBrowser",
      message: `${command} is not available in the browser edition`,
    });
  });
});
