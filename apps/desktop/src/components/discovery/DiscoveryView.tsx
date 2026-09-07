/**
 * Purpose: the discovery page — the setup card until some browsing has actually been recorded,
 * the four interest panels once it has. Both editions have this page now: everything on it is
 * read out of this app's own database, and nothing on it talks to another program.
 *
 * Opening the page is also what opens the two delivery channels, so the page fills itself in
 * while it is being looked at.
 * Main exports: DiscoveryView.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { openPageChannel, useBrowsingInterestStore } from "../../stores/browsingInterestStore";
import { DiscoverySetupSteps } from "./DiscoverySetupSteps";
import { InterestEmotionPanel } from "./InterestEmotionPanel";
import { InterestNewTopicsPanel } from "./InterestNewTopicsPanel";
import { InterestProContentPanel } from "./InterestProContentPanel";
import { InterestWordCloudPanel } from "./InterestWordCloudPanel";

/** While there is nothing yet, look often: someone who has just connected a browser is
 * watching this page for the first thing to appear. */
const WAITING_INTERVAL_MS = 10_000;
/** Once there is history the numbers move on the scale of a browsing session, not a second. */
const COLLECTING_INTERVAL_MS = 60_000;

export function DiscoveryView() {
  const { t } = useTranslation("discovery");
  const ready = useBrowsingInterestStore((state) => state.ready);
  const eventCount = useBrowsingInterestStore((state) => state.eventCount);
  // "A browser has connected" is only knowable on the desktop, where the listener counts the
  // browsers that paired with it. The browser edition has no such moment, so it stays on the
  // setup card until something actually arrives.
  const connected = useBrowsingInterestStore((state) => (state.pairing?.paired ?? 0) > 0);

  useEffect(() => {
    const store = useBrowsingInterestStore.getState();
    void store.refresh().then(() => store.collect());
    void store.loadPairing(true);
    // The browser edition's channel: a script on this very page hands over what it collected
    // elsewhere. Closed again when the page goes away, so nothing listens in the background.
    return openPageChannel();
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () => {
        const store = useBrowsingInterestStore.getState();
        void store.collect();
        // A code that has just been used up is replaced, so a second browser can be connected
        // without the learner having to find a button for it.
        if (store.eventCount === 0) void store.loadPairing(true);
      },
      eventCount > 0 ? COLLECTING_INTERVAL_MS : WAITING_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [eventCount]);

  // Nothing at all until the first read answers: a setup page that flashes away half a second
  // later is worse than a moment of quiet.
  if (!ready) return <div className="h-full" />;
  // Three states, and the middle one is the one worth getting right: a browser that has
  // connected but has not browsed yet gets the real page with its panels honestly empty,
  // rather than setup instructions for something already done.
  if (eventCount === 0 && !connected) {
    return (
      <div className="h-full overflow-y-auto">
        <DiscoverySetupSteps />
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto bg-stone-50/60">
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
        {eventCount === 0 && (
          <p className="text-sm text-stone-500 leading-relaxed">{t("setup.connected")}</p>
        )}
        <InterestEmotionPanel />
        <InterestWordCloudPanel />
        <InterestNewTopicsPanel />
        <InterestProContentPanel />
      </div>
    </div>
  );
}
