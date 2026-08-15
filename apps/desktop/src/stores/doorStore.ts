/**
 * Purpose: zustand store for explore doors (spec 039 §2.1) — per-message door candidates
 * (single-flight, mirrors diglotStore.ensureWoven) and the opened-node bookkeeping pickDoors
 * reads so it never repeats a station. The guess-first popover and its grading (spec 039
 * §2.2) lived here for the old hover-card entry; that entry is gone (spec 042 §6 — ordinary
 * replies now open a focus session directly, no guess), so this store is down to the
 * zero-LLM door-picking half.
 * Main exports: useDoorStore.
 */
import type { DoorCandidate } from "@breadcrumb/plugin-explore";
import { create } from "zustand";
import { appEventBus } from "./chatStore";

interface DoorState {
  doorsByMessage: Map<string, DoorCandidate[]>;
  /** Node ids already opened as doors this conversation — pickDoors never repeats them. */
  openedNodeIds: Set<string>;
  ensureDoors(messageId: string, displaySource: string, conversationId: string): Promise<void>;
  markOpened(nodeId: string): void;
  /** Clears every session-scoped field — call when the active conversation changes. */
  resetForConversation(): void;
}

export const useDoorStore = create<DoorState>((set, get) => ({
  doorsByMessage: new Map(),
  openedNodeIds: new Set(),

  async ensureDoors(messageId, displaySource, conversationId) {
    if (get().doorsByMessage.has(messageId)) return;
    get().doorsByMessage.set(messageId, []); // reserve to keep the pick single-flight
    const { computeDoorPatches } = await import("../lib/conceptDoors");
    const doors = await computeDoorPatches(messageId, displaySource, conversationId);
    set({ doorsByMessage: new Map(get().doorsByMessage).set(messageId, doors) });
  },

  markOpened(nodeId) {
    set({ openedNodeIds: new Set(get().openedNodeIds).add(nodeId) });
  },

  resetForConversation() {
    set({ doorsByMessage: new Map(), openedNodeIds: new Set() });
  },
}));

// Extraction attributes sightings seconds AFTER a fresh reply first renders, so its doors
// were computed against an empty sighting list and cached as []. Dropping the empty entries
// here lets MessageBubble's effect (which depends on the entry) recompute with real data.
appEventBus.on("knowledge:nodesExtracted", () => {
  const doors = useDoorStore.getState().doorsByMessage;
  const kept = new Map([...doors].filter(([, candidates]) => candidates.length > 0));
  if (kept.size !== doors.size) useDoorStore.setState({ doorsByMessage: kept });
});
