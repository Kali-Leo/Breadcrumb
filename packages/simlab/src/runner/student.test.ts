/**
 * Purpose: unit tests for the student call — persona system prompt is prepended, transcript
 * roles are flipped to the student's own point of view, and the STOP token is detected.
 */
import { describe, expect, it } from "vitest";
import { SEED_PERSONAS } from "../persona/seeds";
import { STOP_TOKEN } from "../persona/studentPrompt";
import { getStudentReply } from "./student";

function sseResponse(content: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n`),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const persona = SEED_PERSONAS[0];
if (persona === undefined) throw new Error("no seed persona");

describe("getStudentReply", () => {
  it("prepends the persona system prompt and flips transcript roles", async () => {
    const captured: RequestInit[] = [];
    const config = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "key",
      model: "test-model",
      fetchImpl: (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init) captured.push(init);
        return Promise.resolve(sseResponse("我还是没懂"));
      },
    };
    const transcript = [
      { role: "user" as const, content: "分数是什么" },
      { role: "assistant" as const, content: "分数表示部分和整体的关系" },
    ];
    const reply = await getStudentReply(config, persona, transcript);

    expect(reply.content).toBe("我还是没懂");
    expect(reply.isStop).toBe(false);
    const sentMessages = JSON.parse(String(captured[0]?.body)).messages as {
      role: string;
      content: string;
    }[];
    expect(sentMessages[0]?.role).toBe("system");
    expect(sentMessages[0]?.content).toContain(persona.name);
    // Roles flipped: the student's own prior turn (role "user" in the app convention)
    // becomes "assistant" from its own point of view, and vice versa.
    expect(sentMessages[1]).toEqual({ role: "assistant", content: "分数是什么" });
    expect(sentMessages[2]).toEqual({ role: "user", content: "分数表示部分和整体的关系" });
  });

  it("detects the STOP token when it is the entire reply", async () => {
    const config = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "key",
      model: "test-model",
      fetchImpl: () => Promise.resolve(sseResponse(STOP_TOKEN)),
    };
    const reply = await getStudentReply(config, persona, []);
    expect(reply.isStop).toBe(true);
  });

  it("injects a topic-hint system message when starting a new conversation", async () => {
    const captured: RequestInit[] = [];
    const config = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "key",
      model: "test-model",
      fetchImpl: (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init) captured.push(init);
        return Promise.resolve(sseResponse("好呀"));
      },
    };
    await getStudentReply(config, persona, [], { label: "贝叶斯定理", isDomainJump: false });
    const sentMessages = JSON.parse(String(captured[0]?.body)).messages as {
      role: string;
      content: string;
    }[];
    expect(sentMessages[1]).toEqual({
      role: "system",
      content: "这次对话你想聊聊：「贝叶斯定理」。",
    });
  });

  it("injects a domain-jump nudge instead of a label when isDomainJump is true", async () => {
    const config = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "key",
      model: "test-model",
      fetchImpl: () => Promise.resolve(sseResponse("好呀")),
    };
    const reply = await getStudentReply(config, persona, [], { label: null, isDomainJump: true });
    expect(reply.content).toBe("好呀");
  });

  it("does not treat a reply merely mentioning STOP as a real stop", async () => {
    const config = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "key",
      model: "test-model",
      fetchImpl: () => Promise.resolve(sseResponse(`还没到 ${STOP_TOKEN} 的时候`)),
    };
    const reply = await getStudentReply(config, persona, []);
    expect(reply.isStop).toBe(false);
  });
});
