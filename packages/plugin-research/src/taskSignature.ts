/**
 * Purpose: Ed25519 signature verification for research tasks (spec 036) — clients execute
 * only tasks signed by the project key; a tampered byte anywhere fails verification.
 * Signing lives in signing.dev.ts and is not re-exported from index.ts: the product only ever
 * verifies, and keeping the signer out of the shipped bundle keeps the private key out of
 * reach of anyone tempted to "just sign one thing" at runtime.
 * Main exports: RESEARCH_TASK_PUBLIC_KEY_HEX, verifyResearchTaskSignature, payloadBytes,
 * hexToBytes, bytesToHex.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { canonicalJsonStringify } from "./canonicalJson";
import type { ResearchTask, SignedResearchTask } from "./taskSchema";

/** Project signing public key. The private key never ships (dev copy lives in .env). */
export const RESEARCH_TASK_PUBLIC_KEY_HEX =
  "07982b24f7b867af9c9cebe3c19843ec55c1efb82d6664e21e4f27f7c8e4303c";

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function payloadBytes(payload: ResearchTask): Uint8Array {
  return new TextEncoder().encode(canonicalJsonStringify(payload));
}

/** True only when the signature matches the payload's canonical JSON under the project key. */
export function verifyResearchTaskSignature(
  signed: SignedResearchTask,
  publicKeyHex: string = RESEARCH_TASK_PUBLIC_KEY_HEX,
): boolean {
  try {
    return ed25519.verify(
      hexToBytes(signed.signature),
      payloadBytes(signed.payload),
      hexToBytes(publicKeyHex),
    );
  } catch {
    return false;
  }
}
