/**
 * Purpose: decides when a page's own guide is on screen — the first time that page is opened,
 * and any time the ? in the sidebar asks for it.
 *
 * Each page is remembered separately, because they are opened weeks apart: someone who reads
 * the chat note on their first evening should still meet the discovery note the first time
 * they open discovery. Mounted for the life of the app rather than only during the first run,
 * for the same reason.
 *
 * Main exports: PageGuideHost.
 */
import { useEffect, useState } from "react";
import type { PageGuideId } from "../../lib/platform/settingsSchema";
import { useSettingsStore } from "../../stores/settingsStore";
import { PageGuideCard } from "./PageGuideCard";
import { onPageGuideRequest, pageGuidesHeld } from "./pageGuideRequests";

interface PageGuideHostProps {
  /** The open view. */
  view: Exclude<PageGuideId, "companions">;
  /** The companions roster opens over whichever view is underneath, so while it is out it is
   * the page the reader is actually looking at. */
  companionsOpen: boolean;
}

export function PageGuideHost({ view, companionsOpen }: PageGuideHostProps) {
  const loaded = useSettingsStore((state) => state.loaded);
  const onboardingSeen = useSettingsStore((state) => state.onboardingSeen);
  const seen = useSettingsStore((state) => state.pageGuidesSeen);
  const page: PageGuideId = companionsOpen ? "companions" : view;
  const [showing, setShowing] = useState<PageGuideId | null>(null);

  // First visit to this page: show its note. Held back until the introduction is behind the
  // reader, so the very first launch is one thing at a time rather than two cards at once.
  useEffect(() => {
    if (!loaded || !onboardingSeen || pageGuidesHeld()) return;
    if (seen[page] === true) return;
    setShowing(page);
  }, [loaded, onboardingSeen, seen, page]);

  // The ? in the sidebar: the open page's note, whether or not it has been read.
  useEffect(() => onPageGuideRequest(() => setShowing(page)), [page]);

  // Comparing against the open page rather than clearing on navigation: leaving a page takes
  // its note away without marking it read, so it is still there on the way back.
  if (showing !== page) return null;

  return (
    <PageGuideCard
      page={page}
      onDismiss={() => {
        setShowing(null);
        void useSettingsStore.getState().markPageGuideSeen(page);
      }}
    />
  );
}
