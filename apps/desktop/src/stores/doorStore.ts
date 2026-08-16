/**
 * Purpose: zustand store for explore doors (spec 039 §2.1) — door candidates and the
 * opened-node bookkeeping pickDoors reads, both layered per conversation (parallel chat
 * windows each keep their own doors; switching the main view never wipes another
 * window's). Single-flight per message, mirroring diglotStore.ensureWoven.
 * Main exports: useDoorStore.
 */
import type { DoorCandidate } from "@breadcrumb/plugin-explore";
import { create } from "zustand";
import { appEventBus } from "./chatStore";

interface DoorState {
  doorsByConversation: Map<string, Map<string, DoorCandidate[]>>;
  /** Node ids already opened as doors, per conversation — pickDoors never repeats them. */
  openedByConversation: Map<string, Set<string>>;
  ensureDoors(messageId: string, displaySource: string, conversationId: string): Promise<void>;
  markOpened(conversationId: string, nodeId: string): void;
  openedFor(conversationId: string): ReadonlySet<string>;
}

const EMPTY_OPENED: ReadonlySet<string> = new Set();

export const useDoorStore = create<DoorState>((set, get) => ({
  doorsByConversation: new Map(),
  openedByConversation: new Map(),

  async ensureDoors(messageId, displaySource, conversationId) {
    const layer =
      get().doorsByConversation.get(conversationId) ?? new Map<string, DoorCandidate[]>();
    if (layer.has(messageId)) return;
    layer.set(messageId, []); // reserve to keep the pick single-flight
    set({ doorsByConversation: new Map(get().doorsByConversation).set(conversationId, layer) });
    const { computeDoorPatches } = await import("../lib/conceptDoors");
    const doors = await computeDoorPatches(messageId, displaySource, conversationId);
    // The reservation may have been swept away while we computed — a write-back would
    // resurrect a cleared entry, so it only lands if the reservation is still there.
    const current = get().doorsByConversation.get(conversationId);
    if (current === undefined || !current.has(messageId)) return;
    const nextLayer = new Map(current).set(messageId, doors);
    set({ doorsByConversation: new Map(get().doorsByConversation).set(conversationId, nextLayer) });
  },

  markOpened(conversationId, nodeId) {
    const opened = new Set(get().openedByConversation.get(conversationId) ?? []);
    opened.add(nodeId);
    set({ openedByConversation: new Map(get().openedByConversation).set(conversationId, opened) });
  },

  openedFor(conversationId) {
    return get().openedByConversation.get(conversationId) ?? EMPTY_OPENED;
  },
}));

// Extraction attributes sightings seconds AFTER a fresh reply first renders, so its doors
// were computed against an empty sighting list and cached as []. Dropping the empty entries
// here lets MessageBubble's effect (which depends on the entry) recompute with real data.
appEventBus.on("knowledge:nodesExtracted", () => {
  const layers = useDoorStore.getState().doorsByConversation;
  let changed = false;
  const next = new Map<string, Map<string, DoorCandidate[]>>();
  for (const [conversationId, layer] of layers) {
    const kept = new Map([...layer].filter(([, candidates]) => candidates.length > 0));
    if (kept.size !== layer.size) changed = true;
    next.set(conversationId, kept);
  }
  if (changed) useDoorStore.setState({ doorsByConversation: next });
});
