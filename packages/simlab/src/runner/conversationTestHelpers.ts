/**
 * Purpose: shared test fixtures for runConversation's test suites (conversation.test.ts for
 * S1, conversationTopicHint.test.ts for S3) — a fake SSE/JSON fetch response builder, a
 * JourneyLogWriter fake that records lines in memory, and a temp-DB conversation setup.
 * Main exports: sseFor, jsonCompletion, makeLog, setupConversation.
 */
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";

export function sseFor(content: string): Response {
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

export function jsonCompletion(content: unknown): Response {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

export function makeLog(): {
  path: string;
  writeLine: (record: unknown) => void;
  records: Record<string, unknown>[];
} {
  const records: Record<string, unknown>[] = [];
  return {
    path: "/dev/null",
    writeLine: (record) => records.push(record as Record<string, unknown>),
    records,
  };
}

export async function setupConversation(): Promise<{
  temp: TempDatabase;
  conversationId: string;
}> {
  const db = await createTempDatabase();
  const now = "2026-08-01T10:00:00.000Z";
  const conversationId = "conv-1";
  await db.repos.conversations.create({
    id: conversationId,
    title: "t",
    created_at: now,
    updated_at: now,
  });
  return { temp: db, conversationId };
}
