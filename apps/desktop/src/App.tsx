/**
 * Purpose: application root — loads persisted state once, lays out the three-column shell
 * (sidebar / chat or settings / future knowledge-tree slot) plus the status bar.
 * Main exports: App (default).
 */
import { useEffect, useState } from "react";
import "./App.css";
import { ChatView } from "./components/ChatView";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { useChatStore } from "./stores/chatStore";
import { useSettingsStore } from "./stores/settingsStore";

export default function App() {
  const [view, setView] = useState<"chat" | "settings">("chat");
  const settingsLoaded = useSettingsStore((state) => state.loaded);
  const apiConfig = useSettingsStore((state) => state.apiConfig);

  useEffect(() => {
    void useSettingsStore.getState().loadFromDatabase();
    void useChatStore.getState().loadFromDatabase();
  }, []);

  // First run: no API configured yet -> open settings so the user can start in one step.
  useEffect(() => {
    if (settingsLoaded && apiConfig === null) {
      setView("settings");
    }
  }, [settingsLoaded, apiConfig]);

  return (
    <div className="flex h-screen flex-col text-stone-800">
      <div className="flex min-h-0 flex-1">
        <Sidebar onOpenSettings={() => setView("settings")} />
        <main className="min-w-0 flex-1">
          {view === "chat" ? <ChatView /> : <SettingsPanel onClose={() => setView("chat")} />}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
