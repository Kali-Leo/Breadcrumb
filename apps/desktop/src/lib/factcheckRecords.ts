/**
 * Purpose: the database side of fact-checking — reading a conversation's stored runs back
 * into display shape, resolving the chat round a badge belongs to, and writing one finished
 * run. Kept out of the store so the store holds state and nothing else.
 * Main exports: DisplayClaim, loadConversationLayer, resolveRoundMessages, persistRun.
 */
import type { FactcheckClaimRow, MessageRow } from "@breadcrumb/core-db";
import type { CheckedClaim, EvidenceItem } from "@breadcrumb/plugin-factcheck";
import { z } from "zod";
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

export interface DisplayClaim {
  text: string;
  relationship: string;
  reasoning: string;
  evidence: EvidenceItem[];
}

/** evidence_json is text in a database file the user can edit; parse it, never cast it. */
const evidenceListSchema = z.array(
  z.object({
    url: z.string(),
    title: z.string(),
    snippet: z.string(),
    source: z.string(),
  }),
);

function rowToDisplayClaim(row: FactcheckClaimRow): DisplayClaim {
  const parsed = evidenceListSchema.safeParse(JSON.parse(row.evidence_json));
  return {
    text: row.claim_text,
    relationship: row.relationship,
    reasoning: row.reasoning,
    // A row we cannot read the evidence of still carries a usable verdict; show it without
    // links rather than dropping the claim.
    evidence: parsed.success ? parsed.data : [],
  };
}

/** Every stored run of one conversation, keyed by message id. Two queries total, whatever
 * the run count: one for the runs, one batched query for all of their claims. */
export async function loadConversationLayer(
  conversationId: string,
): Promise<Map<string, DisplayClaim[]>> {
  const repos = await getRepos();
  const runs = await repos.factcheck.listRunsByConversation(conversationId);
  const claimRows = await repos.factcheck.listClaimsByRuns(runs.map((run) => run.id));
  const claimsByRun = new Map<string, FactcheckClaimRow[]>();
  for (const row of claimRows) {
    const existing = claimsByRun.get(row.run_id);
    if (existing === undefined) claimsByRun.set(row.run_id, [row]);
    else existing.push(row);
  }
  const layer = new Map<string, DisplayClaim[]>();
  for (const run of runs) {
    // Oldest-first iteration: the newest run per message naturally wins.
    layer.set(run.message_id, (claimsByRun.get(run.id) ?? []).map(rowToDisplayClaim));
  }
  return layer;
}

/** Resolves the checked assistant message and its preceding user question from the message's
 * OWN conversation (never the active mirror); falls back to the DB when the chat session
 * isn't loaded (a badge can outlive its session in a popup or after a reload race). */
export async function resolveRoundMessages(
  conversationId: string,
  sessionMessages: readonly MessageRow[],
  messageId: string,
): Promise<{ answer: MessageRow | undefined; question: MessageRow | undefined }> {
  let chatMessages = sessionMessages;
  if (chatMessages.length === 0) {
    const repos = await getRepos();
    chatMessages = await repos.messages.listByConversation(conversationId);
  }
  const answerIndex = chatMessages.findIndex((message) => message.id === messageId);
  const answer = chatMessages[answerIndex];
  if (answer?.role !== "assistant") return { answer: undefined, question: undefined };
  const question = chatMessages
    .slice(0, answerIndex)
    .reverse()
    .find((message) => message.role === "user");
  return { answer, question };
}

/** Writes one finished run and returns what the store should show for it. */
export async function persistRun(
  conversationId: string,
  messageId: string,
  claims: readonly CheckedClaim[],
): Promise<{ runId: string; displayClaims: DisplayClaim[] }> {
  const runId = newId();
  const createdAt = nowIso();
  const claimRows: FactcheckClaimRow[] = claims.map((claim) => ({
    id: newId(),
    run_id: runId,
    claim_text: claim.text,
    relationship: claim.relationship,
    reasoning: claim.reasoning,
    evidence_json: JSON.stringify(claim.evidence),
    created_at: createdAt,
  }));
  const repos = await getRepos();
  await repos.factcheck.recordRun(
    { id: runId, message_id: messageId, conversation_id: conversationId, created_at: createdAt },
    claimRows,
  );
  return { runId, displayClaims: claimRows.map(rowToDisplayClaim) };
}
