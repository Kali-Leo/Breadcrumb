/**
 * Purpose: drives the protocol's import path, which the other protocol test cannot reach —
 * Node has no OPFS, so there the session is always in memory and `import` is refused before it
 * starts. Here the pool is faked, so the two moments where the connection is briefly gone get
 * to run: the window while the file is being replaced, and a reopen that does not come back.
 *
 * Both are silent-data-loss shapes. A query answered from a closed connection reads as "this
 * row does not exist" and a write answered from one is thrown away while reporting success, so
 * what these tests guard is that neither ever answers `ok: true`.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

interface FakeState {
  reopenThrows: boolean;
  importDbDelayMs: number;
  importDbThrows: boolean;
  db: { exec(options: unknown): unknown } | null;
}

const state: FakeState = {
  reopenThrows: false,
  importDbDelayMs: 0,
  importDbThrows: false,
  db: null,
};

// The pool VFS is the only thing replaced: the SQLite build, the SQL and the module under test
// are the real ones. Every "connection" hands back the same in-memory database, so closing and
// reopening around an import keeps the rows, exactly as reopening the real file would.
vi.mock("@sqlite.org/sqlite-wasm", async () => {
  const actual = (await vi.importActual("@sqlite.org/sqlite-wasm")) as {
    default: (options?: unknown) => Promise<{ oo1: { DB: new (a: string, b: string) => unknown } }>;
  };
  return {
    default: async (options?: unknown) => {
      const sqlite3 = await actual.default(options);
      class OpfsSAHPoolDb {
        exec: (o: unknown) => unknown;
        close: () => void;
        constructor(_filename: string) {
          if (state.reopenThrows) throw new Error("could not take the sync access handle");
          state.db ??= new sqlite3.oo1.DB(":memory:", "c") as { exec(o: unknown): unknown };
          const db = state.db;
          this.exec = (o: unknown) => db.exec(o);
          this.close = () => {};
        }
      }
      return {
        oo1: sqlite3.oo1,
        installOpfsSAHPoolVfs: async () => ({
          OpfsSAHPoolDb,
          exportFile: () => new Uint8Array([1, 2, 3]),
          importDb: async () => {
            await new Promise((resolve) => setTimeout(resolve, state.importDbDelayMs));
            if (state.importDbThrows) throw new Error("not an sqlite file");
            return 0;
          },
          reserveMinimumCapacity: async () => 6,
        }),
      };
    },
  };
});

beforeAll(() => {
  // What opfsSyncHandlesExist() asks the runtime for, so the pool path is taken.
  const handleClass = class {} as unknown as { prototype: Record<string, unknown> };
  handleClass.prototype.createSyncAccessHandle = () => {};
  Object.defineProperty(globalThis, "FileSystemFileHandle", {
    value: handleClass,
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: { storage: { getDirectory: () => {} } },
    configurable: true,
  });
});

describe("the browser database's protocol, while its file is being replaced", () => {
  it("makes a request that arrives during an import wait for it, rather than answering it from a database that is not open", async () => {
    const { handleRequest } = await import("./sqliteProtocol");
    expect((await handleRequest({ id: 1, kind: "open" })).ok).toBe(true);
    await handleRequest({ id: 2, kind: "execute", sql: "CREATE TABLE t (a)", params: [] });
    await handleRequest({ id: 3, kind: "execute", sql: "INSERT INTO t VALUES (7)", params: [] });

    state.importDbDelayMs = 60;
    const importing = handleRequest({ id: 5, kind: "import", bytes: new Uint8Array([1]) });
    // Long enough that the import is inside its own await when these two arrive. The app is
    // alive throughout an import: timers, the cross-midnight poll and the embedding backfill
    // all keep asking.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const during = await handleRequest({
      id: 6,
      kind: "select",
      sql: "SELECT * FROM t",
      params: [],
    });
    const write = await handleRequest({
      id: 7,
      kind: "execute",
      sql: "INSERT INTO t VALUES (99)",
      params: [],
    });
    expect((await importing).ok).toBe(true);

    // The read saw the real rows, not an empty database.
    expect(during.ok && during.rows).toEqual([{ a: 7 }]);
    expect(write.ok).toBe(true);
    // And the write it reported as successful is actually in the database.
    const after = await handleRequest({
      id: 8,
      kind: "select",
      sql: "SELECT * FROM t",
      params: [],
    });
    expect(after.ok && after.rows).toEqual([{ a: 7 }, { a: 99 }]);
  });

  it("answers every later request with a failure once the connection could not be reopened, instead of discarding writes and reading empty", async () => {
    const { handleRequest } = await import("./sqliteProtocol");
    state.importDbDelayMs = 0;
    state.reopenThrows = true;

    const failed = await handleRequest({ id: 20, kind: "import", bytes: new Uint8Array([1]) });
    expect(failed.ok).toBe(false);
    expect(failed.ok === false && failed.error).toContain("reopen");

    // Even once the cause is gone, this session has no connection: it must say so.
    state.reopenThrows = false;
    const write = await handleRequest({
      id: 21,
      kind: "execute",
      sql: "INSERT INTO t VALUES (5)",
      params: [],
    });
    const read = await handleRequest({
      id: 22,
      kind: "select",
      sql: "SELECT * FROM t",
      params: [],
    });
    expect(write.ok).toBe(false);
    expect(read.ok).toBe(false);
  });

  it("keeps the import's own reason when the reopen fails too, so the reply names both", async () => {
    const { handleRequest } = await import("./sqliteProtocol");
    expect((await handleRequest({ id: 30, kind: "open" })).ok).toBe(true);
    state.importDbThrows = true;
    state.reopenThrows = true;

    const failed = await handleRequest({ id: 31, kind: "import", bytes: new Uint8Array([1]) });
    state.importDbThrows = false;
    state.reopenThrows = false;
    expect(failed.ok).toBe(false);
    const error = failed.ok === false ? failed.error : "";
    expect(error).toContain("not an sqlite file");
    expect(error).toContain("reopen");
  });
});
