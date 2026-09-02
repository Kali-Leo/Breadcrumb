/**
 * Purpose: unit tests for the outbound guard — the address check, and the hand-followed
 * redirect chain that exists because nothing below this layer re-checks a hop. The world on
 * the other side of these calls is external, so fetch is mocked.
 */
import { describe, expect, it, vi } from "vitest";
import { fetchExternalPage, isFetchableUrl } from "./safeFetch";

const TIMEOUT_MS = 1000;

function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe("isFetchableUrl", () => {
  it("refuses the local machine and private networks, allows public https", () => {
    expect(isFetchableUrl("http://127.0.0.1:21456/export")).toBe(false);
    expect(isFetchableUrl("http://localhost:11434/api")).toBe(false);
    expect(isFetchableUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isFetchableUrl("file:///etc/passwd")).toBe(false);
    expect(isFetchableUrl("https://example.com/page")).toBe(true);
  });
});

describe("fetchExternalPage", () => {
  it("asks the platform not to follow redirects, so every hop can be re-checked here", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: { maxRedirections?: number }) => {
        expect(init?.maxRedirections).toBe(0);
        return new Response("body", { status: 200 });
      },
    );

    expect(await fetchExternalPage(fetchImpl, "https://example.com/a", TIMEOUT_MS)).toBe("body");
  });

  it("refuses a redirect that lands on the loopback interface", async () => {
    // The whole point: the first address passes every check, and the answer is "look over
    // there" — at a service only this machine can reach.
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://evil.example/a") {
        return redirectTo("http://127.0.0.1:21456/export");
      }
      return new Response("local service secrets", { status: 200 });
    });

    expect(await fetchExternalPage(fetchImpl, "https://evil.example/a", TIMEOUT_MS)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows an ordinary redirect, resolving a relative Location against the current url", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://example.com/old") return redirectTo("/new");
      expect(String(input)).toBe("https://example.com/new");
      return new Response("moved body", { status: 200 });
    });

    expect(await fetchExternalPage(fetchImpl, "https://example.com/old", TIMEOUT_MS)).toBe(
      "moved body",
    );
  });

  it("gives up past three hops rather than walking a redirect chain forever", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const step = Number(new URL(String(input)).pathname.slice(1));
      return redirectTo(`/${step + 1}`);
    });

    expect(await fetchExternalPage(fetchImpl, "https://example.com/0", TIMEOUT_MS)).toBeNull();
    // The original request plus the three hops it was willing to follow.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("treats an unreadable redirect (the browser's opaque one) as a refusal", async () => {
    // `redirect: "manual"` in a browser yields status 0 and no headers — a hop that cannot
    // be inspected is a hop that cannot be re-checked. The Response constructor refuses to
    // build a status-0 response, which is exactly why this one is hand-made.
    const opaque = { status: 0, ok: false, headers: new Headers() } as unknown as Response;
    const fetchImpl = vi.fn(async () => opaque);

    expect(await fetchExternalPage(fetchImpl, "https://example.com/a", TIMEOUT_MS)).toBeNull();
  });
});
