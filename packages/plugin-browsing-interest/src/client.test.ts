/**
 * Purpose: a session against a service that keeps changing under us — absent, half-broken,
 * healthy, then restarted with a different shape. The tripwires are the failure vocabulary
 * (never anything but "unreachable" / "unexpectedResponse") and that nothing unparsed ever
 * escapes the client.
 */
import { describe, expect, it, vi } from "vitest";
import {
  BrowsingInterestServiceError,
  createBrowsingInterestClient,
  DEFAULT_SERVICE_URL,
  type ServiceFetch,
} from "./client";

const profilePayload = {
  topics: ["编程与软件开发", "萌宠动物"],
  groups: { 科技数码: ["编程与软件开发"], 生活方式: ["萌宠动物"] },
  short: [0.7, 0.3],
  long: [0.6, 0.4],
  expose: [0.5, 0.5],
  prefs: {},
  drivers: { 编程与软件开发: [{ title: "Rust 所有权", up: "某个 UP" }] },
  n_events: 4352,
  classifier: "embedding",
  emotion_on: true,
};

function serviceReturning(state: {
  payload: unknown;
  ok?: boolean;
  status?: number;
}): ServiceFetch {
  return async () => ({
    ok: state.ok ?? true,
    status: state.status ?? 200,
    json: async () => state.payload,
  });
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "no error";
  } catch (error) {
    if (error instanceof BrowsingInterestServiceError) return error.failure;
    throw error;
  }
}

describe("browsing interest client", () => {
  it("walks a whole session of service states without inventing a third failure kind", async () => {
    // 1. Nothing listening on the port yet.
    const dead: ServiceFetch = async () => {
      throw new TypeError("connection refused");
    };
    expect(await failureOf(createBrowsingInterestClient({ fetch: dead }).profile())).toBe(
      "unreachable",
    );

    // 2. Something listening, but it is not our service.
    const wrongServer = createBrowsingInterestClient({
      fetch: serviceReturning({ payload: "<html>nginx</html>" }),
    });
    expect(await failureOf(wrongServer.profile())).toBe("unexpectedResponse");

    // 3. Our service, but an endpoint answers an error status.
    const erroring = createBrowsingInterestClient({
      fetch: serviceReturning({ payload: { error: "not found" }, ok: false, status: 404 }),
    });
    expect(await failureOf(erroring.newInterests())).toBe("unexpectedResponse");

    // 4. Healthy.
    const healthy = createBrowsingInterestClient({
      fetch: serviceReturning({ payload: profilePayload }),
    });
    const profile = await healthy.profile();
    expect(profile.n_events).toBe(4352);
    expect(profile.drivers["编程与软件开发"]?.[0]?.title).toBe("Rust 所有权");

    // 5. Restarted after a taxonomy change that drops a required field.
    const { topics: _dropped, ...withoutTopics } = profilePayload;
    const upgraded = createBrowsingInterestClient({
      fetch: serviceReturning({ payload: withoutTopics }),
    });
    expect(await failureOf(upgraded.profile())).toBe("unexpectedResponse");
  });

  it("fills in the titles the service stores as null", async () => {
    const client = createBrowsingInterestClient({
      fetch: serviceReturning({
        payload: {
          days: 90,
          finished: [],
          unfinished: [
            {
              ts: 1_756_000_000,
              id: null,
              title: null,
              up: null,
              topic: "科学科普",
              group: "知识学习",
              pic: null,
              dwell: 40,
              dur: 600,
              site: "bilibili",
            },
          ],
        },
      }),
    });
    const content = await client.proContent(90);
    expect(content.unfinished[0]).toMatchObject({ title: "", up: "", pic: "", id: "" });
  });

  it("asks the service the questions the panels actually ask", async () => {
    const fetchSpy = vi.fn<ServiceFetch>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ days: 30, source: "engage", words: [] }),
    }));
    const client = createBrowsingInterestClient({ fetch: fetchSpy });
    await client.wordCloud(365);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      `${DEFAULT_SERVICE_URL}/wordcloud?days=365&source=engage`,
    );
  });

  it("gives up on a service that accepts the connection and then goes quiet", async () => {
    const hanging: ServiceFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const client = createBrowsingInterestClient({ fetch: hanging, timeoutMs: 5 });
    expect(await failureOf(client.profile())).toBe("unreachable");
  });
});
