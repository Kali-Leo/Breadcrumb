/**
 * Purpose: the discovery page — setup steps until the local interest service answers, the
 * four interest panels once it does. It re-probes on a timer, so starting the service while
 * this page is open swaps it over without the user touching anything (spec 057 §2).
 * Main exports: DiscoveryView.
 */
import { useEffect } from "react";
import { useBrowsingInterestStore } from "../../stores/browsingInterestStore";
import { DiscoverySetupSteps } from "./DiscoverySetupSteps";
import { InterestEmotionPanel } from "./InterestEmotionPanel";
import { InterestNewTopicsPanel } from "./InterestNewTopicsPanel";
import { InterestProContentPanel } from "./InterestProContentPanel";
import { InterestWordCloudPanel } from "./InterestWordCloudPanel";

/** Fast enough that starting the service feels like it just worked. */
const WAITING_INTERVAL_MS = 5_000;
/** Once connected the numbers move slowly; a browsing session takes minutes, not seconds. */
const CONNECTED_INTERVAL_MS = 60_000;

export function DiscoveryView() {
  const connected = useBrowsingInterestStore((state) => state.connected);
  const probed = useBrowsingInterestStore((state) => state.probed);

  useEffect(() => {
    const store = useBrowsingInterestStore.getState();
    void store.refresh();
    void store.loadConnectionToken();
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () => {
        const store = useBrowsingInterestStore.getState();
        void store.refresh();
        if (!store.connected) void store.loadConnectionToken();
      },
      connected ? CONNECTED_INTERVAL_MS : WAITING_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [connected]);

  // Nothing at all until the first probe answers: a setup page that flashes away half a
  // second later is worse than a moment of quiet.
  if (!probed) return <div className="h-full" />;
  if (!connected) {
    return (
      <div className="h-full overflow-y-auto">
        <DiscoverySetupSteps />
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto bg-stone-50/60">
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
        <InterestEmotionPanel />
        <InterestWordCloudPanel />
        <InterestNewTopicsPanel />
        <InterestProContentPanel />
      </div>
    </div>
  );
}
