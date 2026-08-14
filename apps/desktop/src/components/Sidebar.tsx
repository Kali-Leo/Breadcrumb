/**
 * Purpose: left column — new-chat button, trail cards (spec 041), the breadcrumb trail, and
 * the view switcher (memory palace / lab / settings). Opening or creating a conversation
 * always returns to the chat view so navigation never dead-ends in another view.
 * Main exports: Sidebar.
 */
import { useChatStore } from "../stores/chatStore";
import { CompanionSection } from "./CompanionSection";
import { TrailList } from "./TrailList";
import { TrailPanel } from "./TrailPanel";

interface SidebarProps {
  activeView: "chat" | "settings" | "map" | "lab" | "feedback" | "research";
  onOpenChat(): void;
  onOpenSettings(): void;
  onOpenMap(): void;
  onOpenLab(): void;
  onOpenFeedback(): void;
  onOpenResearch(): void;
}

export function Sidebar({
  activeView,
  onOpenChat,
  onOpenSettings,
  onOpenMap,
  onOpenLab,
  onOpenFeedback,
  onOpenResearch,
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
        <TrailList isChatViewActive={activeView === "chat"} onOpenChat={onOpenChat} />
      </nav>
      {/* Temporarily collapsed so trail cards keep the room (Leo 2026-08-14) — these
          sections are due for their own rework and live one click away meanwhile. */}
      <details className="border-t border-stone-100 px-3 py-1.5">
        <summary className="cursor-pointer list-none text-xs text-stone-400">🍞 面包屑轨迹</summary>
        <TrailPanel />
      </details>
      <details className="border-t border-stone-100 px-3 py-1.5">
        <summary className="cursor-pointer list-none text-xs text-stone-400">👥 伙伴</summary>
        <CompanionSection onOpenChat={onOpenChat} />
      </details>
      <div className="flex items-center justify-between border-t border-stone-100 px-3 py-2">
        {(
          [
            ["🏛️", "记忆宫殿", onOpenMap, activeView === "map"],
            ["🧪", "实验室", onOpenLab, activeView === "lab"],
            ["🪞", "反馈实验室", onOpenFeedback, activeView === "feedback"],
            ["🔬", "研究课题平台", onOpenResearch, activeView === "research"],
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
