/**
 * Purpose: decides which first-use hint is on screen — at most one at a time, each shown once,
 * the moment its element is first actually visible.
 *
 * Mounted for the life of the app rather than only during the first run, because the
 * features are met weeks apart: the first source dot appears after the first answer, the
 * first island after the first conversation, the import button whenever the library is
 * opened. The page is watched for its elements arriving; once every hint has been shown the
 * watching stops entirely, so a returning learner pays nothing for this.
 *
 * A hint counts as seen the moment it is shown. It leaves when its element is used, when
 * anything else is clicked, or after a few seconds on its own. Using a hinted element before
 * its bubble ever came up also counts as seen — a control someone has already pressed needs
 * no introduction.
 * Main exports: FeatureHintHost.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FEATURE_HINT_IDS } from "../../lib/platform/settingsSchema";
import { useSettingsStore } from "../../stores/settingsStore";
import { FeatureHintBubble } from "./FeatureHintBubble";
import { type FoundHint, findNextHint, hintOf } from "./featureHints";

/** How long a bubble stays when nobody touches anything. */
const LINGER_MS = 8000;
/** The fade, matched to the bubble's transition. */
const FADE_MS = 300;
/** Breathing room before the next bubble, so one leaving and one arriving read as two. */
const REST_MS = 1200;

export function FeatureHintHost() {
  const loaded = useSettingsStore((state) => state.loaded);
  const onboardingSeen = useSettingsStore((state) => state.onboardingSeen);
  const hintsSeen = useSettingsStore((state) => state.hintsSeen);
  const [showing, setShowing] = useState<FoundHint | null>(null);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const restUntil = useRef(0);
  const allSeen = FEATURE_HINT_IDS.every((id) => hintsSeen[id] === true);
  // Held back until the opening slides are behind the reader, so the very first launch is
  // one thing at a time.
  const active = loaded && onboardingSeen && !allSeen;

  const finish = useCallback(() => {
    restUntil.current = Date.now() + REST_MS;
    leavingRef.current = false;
    setShowing(null);
    setLeaving(false);
  }, []);

  const dismiss = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    window.setTimeout(finish, FADE_MS);
  }, [finish]);

  // Looking for the next hint: whenever the page changes, coalesced to one look per frame.
  useEffect(() => {
    if (!active || showing !== null) return;
    let frame = 0;
    const look = () => {
      frame = 0;
      const found = findNextHint(useSettingsStore.getState().hintsSeen);
      if (found === null) return;
      setShowing(found);
      void useSettingsStore.getState().markHintSeen(found.id);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(look);
    };
    const first = window.setTimeout(schedule, Math.max(0, restUntil.current - Date.now()));
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-hint", "inert", "class", "style"],
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.clearTimeout(first);
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [active, showing]);

  // Leaving on its own.
  useEffect(() => {
    if (showing === null) return;
    const timer = window.setTimeout(dismiss, LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [showing, dismiss]);

  // Any press anywhere takes the bubble away; a press on a hinted element also settles that
  // element's own hint. Typing into the hinted composer counts the same way, through focus.
  useEffect(() => {
    if (!active) return;
    const onPress = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const pressed = hintOf(target);
      if (pressed !== null && useSettingsStore.getState().hintsSeen[pressed] !== true) {
        void useSettingsStore.getState().markHintSeen(pressed);
      }
      if (showing !== null) dismiss();
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (showing !== null && target !== null && showing.element.contains(target)) dismiss();
    };
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("focusin", onFocus, true);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("focusin", onFocus, true);
    };
  }, [active, showing, dismiss]);

  if (showing === null) return null;
  return (
    <FeatureHintBubble
      id={showing.id}
      element={showing.element}
      leaving={leaving}
      onLost={finish}
    />
  );
}
