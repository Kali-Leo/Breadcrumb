/**
 * Purpose: small below-map panel listing a transfer station's other conversations (spec 041
 * §3) — click a row to open that conversation and locate the node's most recent sighting there.
 * Main exports: TransferPopover.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { EXPLORE_UI_COPY, transferListTitle } from "@breadcrumb/plugin-explore";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";
import { displayTrailTitle } from "../lib/trailNaming";
import { listOtherTrailsForNode } from "../lib/transferLookup";
import { appEventBus, useChatStore } from "../stores/chatStore";

interface TransferRow {
  conversationId: string;
  title: string;
  lastSeenAt: string;
  messageId: string | null;
}

interface TransferPopoverProps {
  nodeId: string;
  nodeLabel: string;
  currentConversationId: string;
  allSightings: readonly NodeSightingRow[];
  onClose(): void;
}

export function TransferPopover({
  nodeId,
  nodeLabel,
  currentConversationId,
  allSightings,
  onClose,
}: TransferPopoverProps) {
  const [rows, setRows] = useState<TransferRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const repos = await getRepos();
      const listings = listOtherTrailsForNode(nodeId, currentConversationId, allSightings);
      const resolved = await Promise.all(
        listings.map(async (listing) => {
          const conversation = await repos.conversations.getById(listing.conversationId);
          return {
            conversationId: listing.conversationId,
            title: conversation ? displayTrailTitle(conversation) : listing.conversationId,
            lastSeenAt: listing.lastSeenAt,
            messageId: listing.messageId,
          };
        }),
      );
      if (!cancelled) setRows(resolved);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [nodeId, currentConversationId, allSightings]);

  async function openTrail(row: TransferRow) {
    await useChatStore.getState().openConversation(row.conversationId);
    if (row.messageId !== null) {
      appEventBus.emit("chat:locateMessage", { messageId: row.messageId });
    }
    onClose();
  }

  if (rows.length === 0) return null;

  return (
    <div className="mx-1 mt-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs">
      <div className="mb-1 flex items-center justify-between text-stone-500">
        <span>{transferListTitle(nodeLabel)}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={EXPLORE_UI_COPY.timelineCollapseLabel}
          className="text-stone-400 hover:text-stone-600"
        >
          ×
        </button>
      </div>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.conversationId}>
            <button
              type="button"
              onClick={() => void openTrail(row)}
              className="flex w-full items-center justify-between truncate rounded px-1.5 py-1 text-left text-stone-600 hover:bg-stone-100"
            >
              <span className="truncate">{row.title}</span>
              <span className="ml-1 shrink-0 text-[10px] text-stone-400">
                {row.lastSeenAt.slice(0, 10)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
