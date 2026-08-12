/**
 * Purpose: patch construction and the diff guard (spec 033) — replacements are expressed
 * as non-destructive span patches over the original message; nothing outside a declared
 * span may ever change, and violating patch sets are rejected wholesale.
 * Main exports: ReplacementPatchSchema, buildPatches, verifyPatches, applyPatches,
 * ReplacementPatch, AppliedSegment.
 */
import { z } from "zod";
import type { LoadedLanguagePack } from "./packSchema";
import type { ScheduledReplacement } from "./scheduler";

/** One display-layer replacement: message[start, end) === original, rendered as
 * `replacement`. The chat store and LLM context never see patches (ADR-0019). */
export const ReplacementPatchSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  original: z.string().min(1),
  replacement: z.string().min(1),
  lemma: z.string().min(1),
});

export type ReplacementPatch = z.infer<typeof ReplacementPatchSchema>;

/** Builds validated patches from the scheduler's picks. Any span mismatch against the
 * original message drops that patch (defensive: scheduler and message must agree). */
export function buildPatches(
  message: string,
  scheduled: readonly ScheduledReplacement[],
  loaded: LoadedLanguagePack,
): ReplacementPatch[] {
  const patches: ReplacementPatch[] = [];
  for (const item of scheduled) {
    const entry = loaded.pack.entries[item.lemma];
    if (entry === undefined) continue;
    if (message.slice(item.start, item.end) !== item.surface) continue;
    patches.push({
      start: item.start,
      end: item.end,
      original: item.surface,
      replacement: entry.target,
      lemma: item.lemma,
    });
  }
  return patches.sort((a, b) => a.start - b.start);
}

/** The diff guard: every patch span must match the original text exactly, spans must be
 * ordered and non-overlapping. A false verdict means the whole set must be discarded. */
export function verifyPatches(message: string, patches: readonly ReplacementPatch[]): boolean {
  let previousEnd = -1;
  for (const patch of patches) {
    if (ReplacementPatchSchema.safeParse(patch).success === false) return false;
    if (patch.start < previousEnd || patch.end <= patch.start) return false;
    if (patch.end > message.length) return false;
    if (message.slice(patch.start, patch.end) !== patch.original) return false;
    previousEnd = patch.end;
  }
  return true;
}

/** One run of rendered output: plain text, or a woven word carrying its patch. */
export type AppliedSegment =
  | { kind: "text"; text: string }
  | { kind: "woven"; patch: ReplacementPatch };

/** Splits the message into render segments. Returns null when the diff guard rejects the
 * patch set — callers must then render the original untouched. */
export function applyPatches(
  message: string,
  patches: readonly ReplacementPatch[],
): AppliedSegment[] | null {
  if (!verifyPatches(message, patches)) return null;
  const segments: AppliedSegment[] = [];
  let cursor = 0;
  for (const patch of patches) {
    if (patch.start > cursor) {
      segments.push({ kind: "text", text: message.slice(cursor, patch.start) });
    }
    segments.push({ kind: "woven", patch });
    cursor = patch.end;
  }
  if (cursor < message.length) {
    segments.push({ kind: "text", text: message.slice(cursor) });
  }
  return segments;
}
