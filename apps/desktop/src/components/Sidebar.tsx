/**
 * Purpose: left column — new-chat button, companion rows pinned above the trail cards
 * (spec 044: the companion drawer is gone, companions are just conversations), the
 * icon-only view switcher, and the connectivity dot that replaced the status bar.
 * Main exports: Sidebar.
 */
import { useChatStore } from "../stores/chatStore";
import { useSettingsStore } from "../stores/settingsStore";
import { CompanionSection } from "./CompanionSection";
import { TrailList } from "./TrailList";

interface SidebarProps {
  activeView: "chat" | "settings" | "map" | "lab" | "feedback";
  onOpenChat(): void;
  onOpenSettings(): void;
  onOpenMap(): void;
  onOpenLab(): void;
  onOpenFeedback(): void;
}

/** The status bar's network indicator, shrunk to a dot (spec 044): connectivity is
 * peripheral information — visible at a glance, explained on hover, never in the way. */
function ConnectivityDot() {
  const networkEnabled = useSettingsStore((state) => state.networkEnabled);
  return (
    <span
      title={networkEnabled ? "联网中" : "已离线,联网功能安静停下,学习不受影响"}
      className={`h-2 w-2 cursor-help rounded-full ${networkEnabled ? "bg-amber-400" : "bg-stone-300"}`}
    />
  );
}

export function Sidebar({
  activeView,
  onOpenChat,
  onOpenSettings,
  onOpenMap,
  onOpenLab,
  onOpenFeedback,
}: SidebarProps) {
  const startNewConversation = useChatStore((state) => state.startNewConversation);

  return (
    <aside className="flex h-full w-60 flex-col border-r border-stone-200 bg-white">
      <div className="flex items-center gap-2 p-3">
        <span className="text-xl">🍞</span>
        <span className="font-semibold text-stone-700">Breadcrumb</span>
      </div>
      <button
        type="button"
        onClick={() => {
          void startNewConversation();
          onOpenChat();
        }}
        className="mx-3 mb-2 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm text-amber-600 transition-colors hover:bg-amber-50"
      >
        ＋ 新的学习对话
      </button>
      <nav className="flex-1 overflow-y-auto px-2">
        <CompanionSection onOpenChat={onOpenChat} />
        <TrailList isChatViewActive={activeView === "chat"} onOpenChat={onOpenChat} />
      </nav>
      <div className="flex items-center gap-1 border-t border-stone-100 px-3 py-2">
        <ConnectivityDot />
        <span className="flex-1" />
        {(
          [
            ["🏛️", "记忆宫殿", onOpenMap, activeView === "map"],
            ["🧪", "实验室", onOpenLab, activeView === "lab"],
            ["🪞", "反馈实验室", onOpenFeedback, activeView === "feedback"],
            ["⚙️", "设置", onOpenSettings, activeView === "settings"],
          ] as const
        ).map(([icon, name, onClick, active]) => (
          <button
            key={name}
            type="button"
            onClick={onClick}
            title={name}
            aria-label={name}
            className={`rounded-lg px-2 py-1 text-base transition-colors ${
              active ? "bg-amber-100" : "hover:bg-stone-100"
            }`}
          >
            {icon}
          </button>
        ))}
      </div>
    </aside>
  );
}
