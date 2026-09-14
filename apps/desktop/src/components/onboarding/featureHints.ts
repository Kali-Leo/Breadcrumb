/**
 * Purpose: the first-use hints as data — which side of its element each one prefers, and how
 * the next one to show is found in the live page.
 *
 * An element takes part by carrying `data-hint="<id>"`; nothing registers itself. That keeps
 * the feature components free of any hint code beyond one attribute, and lets an element that
 * renders months after the first launch (the first source dot, the first island) still get
 * its sentence the first time it is actually there.
 *
 * "On screen" is decided by hit-testing the element's centre, not only by its box: a control
 * under the drawer's scrim or behind the companions roster has a box and is still not
 * something anyone can see.
 * Main exports: HINT_PLACEMENT, hintOf, findNextHint, FoundHint.
 */
import {
  FEATURE_HINT_IDS,
  type FeatureHintId,
  type HintsSeen,
} from "../../lib/platform/settingsSchema";
import type { HintPlace } from "./hintPlacement";

export const HINT_PLACEMENT: Record<FeatureHintId, HintPlace> = {
  chatMode: "top",
  composer: "top",
  groundingMark: "bottom",
  mapFirstIsland: "top",
  discoveryScript: "bottom",
  libraryImport: "bottom",
  settingsApi: "bottom",
};

const ID_SET: ReadonlySet<string> = new Set(FEATURE_HINT_IDS);

/** The hint id an element carries, or null when it carries none or an unknown one. */
export function hintOf(element: Element | null): FeatureHintId | null {
  const carrier = element?.closest("[data-hint]") ?? null;
  const id = carrier?.getAttribute("data-hint") ?? "";
  return ID_SET.has(id) ? (id as FeatureHintId) : null;
}

export interface FoundHint {
  id: FeatureHintId;
  element: Element;
}

function isOnScreen(element: Element): boolean {
  if (element.closest("[inert], [aria-hidden='true']") !== null) return false;
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false;
  const centreX = box.left + box.width / 2;
  const centreY = box.top + box.height / 2;
  if (centreX < 0 || centreY < 0 || centreX > window.innerWidth || centreY > window.innerHeight) {
    return false;
  }
  const hit = document.elementFromPoint(centreX, centreY);
  return hit !== null && (hit === element || element.contains(hit));
}

/** The first unseen hint, in FEATURE_HINT_IDS order, whose element is on screen right now. */
export function findNextHint(seen: HintsSeen): FoundHint | null {
  const carriers = document.querySelectorAll("[data-hint]");
  for (const id of FEATURE_HINT_IDS) {
    if (seen[id] === true) continue;
    for (const element of carriers) {
      if (element.getAttribute("data-hint") !== id) continue;
      if (isOnScreen(element)) return { id, element };
    }
  }
  return null;
}
