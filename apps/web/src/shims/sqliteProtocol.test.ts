/**
 * Purpose: drives the worker protocol without a Worker. The page's whole database goes through
 * these six messages, and until now none of them had a test: the migrations test builds its own
 * in-memory handle and never touches this file.
 *
 * Node has no OPFS, so every run here takes the fallback path — which is exactly the path that
 * decides what a learner in a private window or a second tab is told, and the path on which
 * "export a backup" has to refuse instead of handing back an empty file.
 */
import { describe, expect, it } from "vitest";
import { handleRequest, type WorkerReply } from "./sqliteProtocol";

async function ok(reply: Promise<WorkerReply>): Promise<WorkerReply & { ok: true }> {
  const settled = await reply;
  if (!settled.ok) throw new Error(settled.error);
  return settled;
}

describe("the browser database's protocol", () => {
  it("opens, and says why this session is not on disk", async () => {
    const opened = await ok(handleRequest({ id: 1, kind: "open" }));
    // Not "it failed": the reason is what the banner turns into a sentence.
    expect(opened.persistent).toBe(false);
    expect(opened.blocker).toBe("unsupported");
  }, 60_000);

  it("answers every reply with the id it was asked with", async () => {
    const reply = await ok(handleRequest({ id: 42, kind: "execute", sql: "SELECT 1", params: [] }));
    expect(reply.id).toBe(42);
  });

  it("runs statements and reads rows back", async () => {
    await ok(handleRequest({ id: 2, kind: "execute", sql: "CREATE TABLE t (a, b)", params: [] }));
    await ok(
      handleRequest({
        id: 3,
        kind: "execute",
        sql: "INSERT INTO t VALUES (?, ?)",
        params: [1, "x"],
      }),
    );
    const read = await ok(
      handleRequest({ id: 4, kind: "select", sql: "SELECT * FROM t", params: [] }),
    );
    expect(read.rows).toEqual([{ a: 1, b: "x" }]);
  });

  it("stores booleans as the integers the schema expects", async () => {
    await ok(
      handleRequest({ id: 5, kind: "execute", sql: "CREATE TABLE flags (a, b)", params: [] }),
    );
    await ok(
      handleRequest({
        id: 6,
        kind: "execute",
        sql: "INSERT INTO flags VALUES (?, ?)",
        params: [true, false],
      }),
    );
    const read = await ok(
      handleRequest({ id: 7, kind: "select", sql: "SELECT a, b FROM flags", params: [] }),
    );
    expect(read.rows).toEqual([{ a: 1, b: 0 }]);
  });

  it("rolls a failed transaction all the way back", async () => {
    const reply = await handleRequest({
      id: 8,
      kind: "transaction",
      statements: [
        { sql: "INSERT INTO t VALUES (9, 'kept?')", params: [] },
        { sql: "INSERT INTO nonexistent VALUES (1)", params: [] },
      ],
    });
    expect(reply.ok).toBe(false);
    const read = await ok(
      handleRequest({
        id: 9,
        kind: "select",
        sql: "SELECT count(*) AS n FROM t WHERE a = 9",
        params: [],
      }),
    );
    expect(read.rows).toEqual([{ n: 0 }]);
  });

  it("reports a failure rather than throwing, so the page's promise always settles", async () => {
    const reply = await handleRequest({
      id: 10,
      kind: "select",
      sql: "SELECT * FROM missing",
      params: [],
    });
    expect(reply.ok).toBe(false);
  });

  it("refuses to export a session that has no file behind it", async () => {
    const reply = await handleRequest({ id: 11, kind: "export" });
    // The alternative — resolving with zero bytes — would download a file that looks like a
    // backup and contains nothing.
    expect(reply.ok).toBe(false);
  });

  it("refuses to import into a session that has no file behind it", async () => {
    const reply = await handleRequest({ id: 12, kind: "import", bytes: new Uint8Array(1024) });
    expect(reply.ok).toBe(false);
  });
});
