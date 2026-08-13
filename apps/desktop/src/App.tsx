/**
 * Purpose: application root — loads persisted state once, lays out the shell
 * (sidebar / chat, settings, map or lab view / knowledge navigation) plus the status bar.
 * Main exports: App (default).
 */
import { useEffect, useState } from "react";
import "./App.css";
import { ChatView } from "./components/ChatView";
import { KnowledgeTreePanel } from "./components/KnowledgeTreePanel";
import { LabPanel } from "./components/LabPanel";
import { MapView } from "./components/map/MapView";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { runDedupSweep } from "./lib/dedupSweep";
import { backfillMissingEmbeddings } from "./lib/embeddings";
import { appEventBus, useChatStore } from "./stores/chatStore";
// Side-effect only: registers edgeStore's knowledge:nodesExtracted subscription.
import "./stores/edgeStore";
// Side-effect only: registers interestStore's knowledge:nodesExtracted subscription.
import "./stores/interestStore";
// Side-effect only: teach-back quality judgment on finished teach rounds (vision/09 #2).
import "./lib/teachQuality";
import { useDiglotStore } from "./stores/diglotStore";
import { useKnowledgeStore } from "./stores/knowledgeStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useTrailStore } from "./stores/trailStore";

export default function App() {
  const [view, setView] = useState<"chat" | "settings" | "map" | "lab">("chat");
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  useEffect(() => {
    void (async () => {
      await useSettingsStore.getState().loadFromDatabase();
      await useDiglotStore.getState().loadFromDatabase();
      await useChatStore.getState().loadFromDatabase();
      await useKnowledgeStore.getState().loadTree();
      await useTrailStore.getState().refreshToday();
      await useTrailStore.getState().ensureYesterdaySummary();
      // Fire-and-forget: catches up any node missing its embedding without blocking the UI,
      // then runs the duplicate-node merge sweep once embeddings are in place (spec 015 #4).
      void backfillMissingEmbeddings().then(() => runDedupSweep());
    })();
  }, []);

  // Keep the session trail in sync with the open conversation.
  useEffect(() => {
    void useKnowledgeStore.getState().loadSessionTrail(activeConversationId);
  }, [activeConversationId]);

  // First run: no API configured yet -> open settings so the user can start in one step.
  useEffect(() => {
    if (settingsLoaded && apiConfig === null) {
      setView("settings");
    }
  }, [settingsLoaded, apiConfig]);

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
          onOpenChat={() => setView("chat")}
          onOpenSettings={() => setView("settings")}
          onOpenMap={() => setView("map")}
          onOpenLab={() => setView("lab")}
        />
        <main className="min-w-0 flex-1">
          {view === "chat" && <ChatView />}
          {view === "settings" && <SettingsPanel onClose={() => setView("chat")} />}
          {view === "map" && <MapView />}
          {view === "lab" && <LabPanel />}
        </main>
        {view === "chat" && <KnowledgeTreePanel />}
      </div>
      <StatusBar />
    </div>
  );
}
