/**
 * Purpose: pins the one thing about db.ts's memoization that is easy to get wrong and
 * impossible to notice — that a failed open is not remembered.
 *
 * The failure this guards against is not the first error; it is every error after it. A
 * plain `??=` caches the rejected promise, so a database that was momentarily busy would
 * keep handing the same stale rejection to every screen for the rest of the session while
 * the underlying cause was long gone, and nothing would ever try to open it again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { get: vi.fn(async () => ({ select: vi.fn(), execute: vi.fn() })) },
}));
vi.mock("@breadcrumb/core-db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runMigrations: vi.fn(),
}));

const { invoke } = await import("@tauri-apps/api/core");
const invokeMock = vi.mocked(invoke);

describe("the memoized database handle", () => {
  beforeEach(async () => {
    vi.resetModules();
    invokeMock.mockReset();
  });

  it("opens once and reuses that one client", async () => {
    invokeMock.mockResolvedValue("sqlite:breadcrumb.db");
    const { getSqlClient } = await import("./db");
    const [first, second] = await Promise.all([getSqlClient(), getSqlClient()]);
    expect(first).toBe(second);
    expect(invokeMock.mock.calls.filter((call) => call[0] === "open_app_database")).toHaveLength(1);
  });

  it("tries again after a failed open instead of serving the old error forever", async () => {
    invokeMock.mockRejectedValueOnce(new Error("the database was busy"));
    invokeMock.mockResolvedValue("sqlite:breadcrumb.db");
    const { getSqlClient } = await import("./db");
    await expect(getSqlClient()).rejects.toThrow("the database was busy");
    await expect(getSqlClient()).resolves.toBeDefined();
  });

  it("tries again after a failed repository build too", async () => {
    invokeMock.mockRejectedValueOnce(new Error("the database was busy"));
    invokeMock.mockResolvedValue("sqlite:breadcrumb.db");
    const { getRepos } = await import("./db");
    await expect(getRepos()).rejects.toThrow("the database was busy");
    await expect(getRepos()).resolves.toBeDefined();
  });
});
