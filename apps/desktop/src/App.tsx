/**
 * Purpose: application root — loads persisted state once, lays out the shell around the
 * three spaces (chat / memory palace / settings; specs 044-047 consolidated everything
 * else into them).
 * Main exports: App (default).
 */
import { useEffect, useState } from "react";
import "./App.css";
import { ChatView } from "./components/ChatView";
import { CompanionChatPopup } from "./components/CompanionChatPopup";
import { CompanionSection } from "./components/CompanionSection";
import { DiscoveryView } from "./components/DiscoveryView";
import { FocusOverlay } from "./components/FocusOverlay";
import { MapView } from "./components/map/MapView";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { VocabPanel } from "./components/VocabPanel";
import { runDedupSweep } from "./lib/dedupSweep";
import { backfillMissingEmbeddings } from "./lib/embeddings";
import { appEventBus, useChatStore } from "./stores/chatStore";
// Side-effect only: registers edgeStore's knowledge:nodesExtracted subscription.
import "./stores/edgeStore";
// Side-effect only: registers interestStore's knowledge:nodesExtracted subscription.
import "./stores/interestStore";
// Side-effect only: teach-back quality judgment on finished teach rounds (vision/09 #2).
import "./lib/teachQuality";
import { useCompanionStore } from "./stores/companionStore";
import { useDiglotStore } from "./stores/diglotStore";
import { useFocusSessionsStore } from "./stores/focusSessionsStore";
import { useKnowledgeStore } from "./stores/knowledgeStore";
import { useResearchStore } from "./stores/researchStore";
import { useSettingsStore } from "./stores/settingsStore";

/** Idle delay before the research task platform's v1 "idle execution" kicks in — no real
 * OS-level idle detection yet, just a fixed wait after startup (spec 036 §3, noted as a v1
 * simplification). */
const RESEARCH_IDLE_DELAY_MS = 10_000;

export default function App() {
  const [view, setView] = useState<"chat" | "settings" | "map" | "vocab" | "discovery">("chat");
  const [companionsOpen, setCompanionsOpen] = useState(false);
  const [helperPopup, setHelperPopup] = useState<{ conversationId: string; title: string } | null>(
    null,
  );
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  useEffect(() => {
    void (async () => {
      await useSettingsStore.getState().loadFromDatabase();
      await useDiglotStore.getState().loadFromDatabase();
      await useChatStore.getState().loadFromDatabase();
      await useKnowledgeStore.getState().loadTree();
      await useCompanionStore.getState().initialize();
      // Fire-and-forget: catches up any node missing its embedding without blocking the UI,
      // then runs the duplicate-node merge sweep once embeddings are in place (spec 015 #4).
      void backfillMissingEmbeddings().then(() => runDedupSweep());
    })();
  }, []);

  // Research task platform (spec 036 §3): v1's "idle execution" is a fixed delay after
  // startup rather than real OS idle detection — enough to stay out of the critical path
  // while still running within the session. Re-checks the switch at fire time, not at
  // mount time, so a user who disables it in the first 10s is respected.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (useSettingsStore.getState().featureSwitches.researchTasks) {
        void useResearchStore.getState().runPending();
      }
    }, RESEARCH_IDLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Keep the session trail in sync with the open conversation — fill-on-first-visit, so a
  // revisited conversation shows its cached trail instantly.
  useEffect(() => {
    void useKnowledgeStore.getState().ensureTrailLoaded(activeConversationId);
  }, [activeConversationId]);

  // Keep the focus-session badge/bar lookups in sync with the open conversation (spec 042 §5,
  // Leo 2026-08-14 revision) — same fill-on-first-visit shape, no wipe on switch.
  useEffect(() => {
    void useFocusSessionsStore.getState().ensureLoaded(activeConversationId);
  }, [activeConversationId]);

  // First run: no API configured yet -> open settings so the user can start in one step.
  useEffect(() => {
    if (settingsLoaded && apiConfig === null) {
      setView("settings");
    }
  }, [settingsLoaded, apiConfig]);

  // Helper conversations open in the floating popup, never the main view (spec 050 §8).
  useEffect(() => {
    return appEventBus.on("companion:openPopup", (payload) => setHelperPopup(payload));
  }, []);

  // Practice discussions (spec 026) jump from the comparison tree into the chat view.
  useEffect(() => {
    return appEventBus.on("app:navigateChat", ({ conversationId }) => {
      void useChatStore.getState().openConversation(conversationId);
      setView("chat");
    });
  }, []);

  return (
    <div className="flex h-screen flex-col text-stone-800">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          activeView={view}
          companionsOpen={companionsOpen}
          onOpenChat={() => setView("chat")}
          onOpenSettings={() => setView("settings")}
          onOpenMap={() => setView("map")}
          onOpenVocab={() => setView("vocab")}
          onOpenDiscovery={() => setView("discovery")}
          onToggleCompanions={() => setCompanionsOpen((open) => !open)}
        />
        <main className="relative min-w-0 flex-1">
          {view === "chat" && <ChatView />}
          {view === "settings" && <SettingsPanel onClose={() => setView("chat")} />}
          {view === "map" && <MapView />}
          {view === "vocab" && <VocabPanel />}
          {view === "discovery" && <DiscoveryView />}
          {/* The companions roster pops out at the center area's lower-left, sized to its
              three rows; clicking anywhere else dismisses it (Leo's design). */}
          {companionsOpen && (
            <>
              <button
                type="button"
                aria-label="关闭伙伴列表"
                onClick={() => setCompanionsOpen(false)}
                className="absolute inset-0 z-20 cursor-default"
              />
              <div className="absolute bottom-2 left-2 z-30 w-64 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
                <CompanionSection onPicked={() => setCompanionsOpen(false)} />
              </div>
            </>
          )}
          {helperPopup !== null && (
            <CompanionChatPopup
              conversationId={helperPopup.conversationId}
              title={helperPopup.title}
              onClose={() => setHelperPopup(null)}
            />
          )}
        </main>
      </div>
      <FocusOverlay />
    </div>
  );
}
