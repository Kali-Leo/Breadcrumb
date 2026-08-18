/**
 * Purpose: the 收藏 list (spec 053 §6) — everything the reader kept, newest first, each row
 * opening into the same reader the feed opens into. Read straight from the pool table rather
 * than from the feed's page, so items kept weeks ago are still here after they left the grid.
 * 收藏 is a bookmark and carries no "like" meaning; nothing here feeds back into ordering.
 * Opens over the window through ScreenOverlay as a modal dialog, which also carries Escape, focus
 * and the dialog role; a reader opened from a row stacks a second dialog on top of this one, and
 * Escape there closes only the reader and comes back here.
 * Main exports: DiscoverySavedOverlay.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";
import { sourceAndAuthorLine } from "../lib/discoveryCardPresentation";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryKindIcon } from "./DiscoveryKindIcon";
import { ScreenOverlay, screenOverlayAutofocusRef } from "./ScreenOverlay";

const EMPTY_LINE = "还没有收藏。看到想留着的内容，点一下卡片上的收藏。";

interface DiscoverySavedOverlayProps {
  onOpenCard(card: DiscoveryCardRow): void;
  onClose(): void;
}

function SavedRow({
  card,
  onOpen,
  onRemove,
}: {
  card: DiscoveryCardRow;
  onOpen(): void;
  onRemove(): void;
}) {
  const sourceLine = sourceAndAuthorLine(card);
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {card.cover_url !== null && (
          <img
            src={card.cover_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-12 w-20 shrink-0 rounded-lg bg-stone-100 object-cover"
          />
        )}
        <span className="min-w-0">
          <span className="block truncate font-medium text-[15px] text-stone-700">
            {card.title}
          </span>
          {sourceLine !== null && (
            <span className="mt-0.5 flex items-center gap-1.5 text-stone-400 text-xs">
              <DiscoveryKindIcon kind={card.kind} />
              <span className="truncate">{sourceLine}</span>
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-lg px-2 py-1 text-sm text-stone-400 hover:bg-stone-100 hover:text-stone-600"
      >
        取消收藏
      </button>
    </li>
  );
}

export function DiscoverySavedOverlay({ onOpenCard, onClose }: DiscoverySavedOverlayProps) {
  const [cards, setCards] = useState<DiscoveryCardRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      const repos = await getRepos();
      setCards(await repos.discovery.listSaved());
    })();
  }, []);

  function remove(card: DiscoveryCardRow): void {
    setCards((current) => (current ?? []).filter((one) => one.id !== card.id));
    void useDiscoveryStore.getState().unsaveCard(card.id, card.topic_label);
  }

  return (
    <ScreenOverlay label="收藏" onClose={onClose}>
      <div className="flex shrink-0 items-center gap-4 border-stone-200 border-b px-6 py-3">
        <p className="font-semibold text-stone-800">收藏</p>
        <button
          type="button"
          ref={screenOverlayAutofocusRef}
          onClick={onClose}
          className="ml-auto rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
        >
          关闭
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-6 py-6">
          {cards !== null && cards.length === 0 && <p className="text-stone-500">{EMPTY_LINE}</p>}
          <ul className="space-y-2">
            {(cards ?? []).map((card) => (
              <SavedRow
                key={card.id}
                card={card}
                onOpen={() => onOpenCard(card)}
                onRemove={() => remove(card)}
              />
            ))}
          </ul>
        </div>
      </div>
    </ScreenOverlay>
  );
}
