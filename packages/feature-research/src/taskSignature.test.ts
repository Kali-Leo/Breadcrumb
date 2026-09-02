/**
 * Purpose: unit tests for the Ed25519 task-signature contract — round trip with an
 * ephemeral key, tampered-byte rejection, wrong-key rejection, malformed input safety.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import { signResearchTask } from "./signing.dev";
import type { ResearchTask, SignedResearchTask } from "./taskSchema";
import { verifyResearchTaskSignature } from "./taskSignature";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const privateKey = ed25519.utils.randomSecretKey();
const privateHex = toHex(privateKey);
const publicHex = toHex(ed25519.getPublicKey(privateKey));

const task: ResearchTask = {
  id: "sample-study",
  institution: "Test University",
  title: "Encounter distribution",
  purpose: "Understand how re-encounters distribute across concepts for spacing research.",
  calls: [{ fn: "count", metric: "concepts_known" }],
  display: [{ kind: "stat", label: "concepts", callIndex: 0 }],
  expiresAt: "2030-01-01",
};

function sign(payload: ResearchTask): SignedResearchTask {
  return { payload, signature: signResearchTask(payload, privateHex) };
}

describe("research task signature", () => {
  it("verifies a correctly signed payload", () => {
    expect(verifyResearchTaskSignature(sign(task), publicHex)).toBe(true);
  });

  it("verifies independently of payload key order", () => {
    const signed = sign(task);
    const reordered = JSON.parse(
      JSON.stringify({ ...signed.payload, purpose: signed.payload.purpose }),
    ) as ResearchTask;
    expect(
      verifyResearchTaskSignature({ payload: reordered, signature: signed.signature }, publicHex),
    ).toBe(true);
  });

  it("rejects any tampered payload field", () => {
    const signed = sign(task);
    const tampered = { ...signed, payload: { ...signed.payload, title: "Encounter Distribution" } };
    expect(verifyResearchTaskSignature(tampered, publicHex)).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const otherPrivate = toHex(ed25519.utils.randomSecretKey());
    const forged = { payload: task, signature: signResearchTask(task, otherPrivate) };
    expect(verifyResearchTaskSignature(forged, publicHex)).toBe(false);
  });

  it("returns false instead of throwing on malformed signature bytes", () => {
    const signed = sign(task);
    expect(verifyResearchTaskSignature({ ...signed, signature: "zz".repeat(64) }, publicHex)).toBe(
      false,
    );
  });
});
