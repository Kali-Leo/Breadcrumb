/**
 * Purpose: signs a research task (spec 036). Dev-only, and deliberately not re-exported from
 * index.ts — the app never signs anything, it only verifies. Keeping the signer off the public
 * entry means it is not in the shipped bundle and there is no convenient hook for a future
 * "just sign this one thing at runtime", which is how a private key ends up in a product.
 *
 * Callers: the dev signing CLI (packages/plugin-research/scripts/signResearchTask.mjs keeps its
 * own plain-JS copy) and tests, which sign with ephemeral keys they generate themselves.
 * Main exports: signResearchTask.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import type { ResearchTask } from "./taskSchema";
import { bytesToHex, hexToBytes, payloadBytes } from "./taskSignature";

/** Signs a task payload — used by the dev signing script and by tests with ephemeral keys. */
export function signResearchTask(payload: ResearchTask, privateKeyHex: string): string {
  return bytesToHex(ed25519.sign(payloadBytes(payload), hexToBytes(privateKeyHex)));
}
