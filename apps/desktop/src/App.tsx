/**
 * Purpose: application root — loads persisted state once, lays out the shell
 * (sidebar / chat or settings / knowledge navigation) plus the status bar.
 * Main exports: App (default).
 */
import { useEffect, useState } from "react";
import "./App.css";
import { ChatView } from "./components/ChatView";
import { KnowledgeTreePanel } from "./components/KnowledgeTreePanel";
import { MapView } from "./components/map/MapView";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { useChatStore } from "./stores/chatStore";
import { useKnowledgeStore } from "./stores/knowledgeStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useTrailStore } from "./stores/trailStore";

export default function App() {
  const [view, setView] = useState<"chat" | "settings" | "map">("chat");
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  useEffect(() => {
    void (async () => {
      await useSettingsStore.getState().loadFromDatabase();
      await useChatStore.getState().loadFromDatabase();
      await useKnowledgeStore.getState().loadTree();
      await useTrailStore.getState().refreshToday();
      await useTrailStore.getState().ensureYesterdaySummary();
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

  return (
    <div className="flex h-screen flex-col text-stone-800">
      <div className="flex min-h-0 flex-1">
        <Sidebar onOpenSettings={() => setView("settings")} onOpenMap={() => setView("map")} />
        <main className="min-w-0 flex-1">
          {view === "chat" && <ChatView />}
          {view === "settings" && <SettingsPanel onClose={() => setView("chat")} />}
          {view === "map" && <MapView />}
        </main>
        {view === "chat" && <KnowledgeTreePanel />}
      </div>
      <StatusBar />
    </div>
  );
}
