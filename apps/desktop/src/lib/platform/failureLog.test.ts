/**
 * Purpose: unit tests for recordAiFailure — writes the expected row shape (Error vs plain
 * thrown value) and never throws, even when the underlying repo write itself fails.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const recordMock = vi.fn();
vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({ aiFailures: { record: recordMock } })),
}));

const { recordAiFailure } = await import("./failureLog");

afterEach(() => {
  recordMock.mockReset();
});

describe("recordAiFailure", () => {
  it("records an Error's message under the given purpose", async () => {
    recordMock.mockResolvedValueOnce(undefined);
    await recordAiFailure("interest", new Error("network blip"));

    expect(recordMock).toHaveBeenCalledTimes(1);
    const row = recordMock.mock.calls[0]?.[0];
    expect(row).toMatchObject({ purpose: "interest", message: "network blip" });
    expect(typeof row.id).toBe("string");
    expect(typeof row.created_at).toBe("string");
  });

  it("stringifies a non-Error thrown value", async () => {
    recordMock.mockResolvedValueOnce(undefined);
    await recordAiFailure("knowledge-edges", "plain string failure");

    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({ message: "plain string failure" });
  });

  it("never throws even when the repo write itself fails", async () => {
    recordMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(recordAiFailure("trail", new Error("x"))).resolves.toBeUndefined();
  });
});
