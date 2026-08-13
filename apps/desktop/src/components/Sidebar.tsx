/**
 * Purpose: left column — new-chat button, conversation list, trail, and the view switcher
 * (memory palace / lab / settings). Opening or creating a conversation always returns to
 * the chat view so navigation never dead-ends in another view.
 * Main exports: Sidebar.
 */
import { useChatStore } from "../stores/chatStore";
import { TrailPanel } from "./TrailPanel";

interface SidebarProps {
  activeView: "chat" | "settings" | "map" | "lab" | "feedback";
  onOpenChat(): void;
  onOpenSettings(): void;
  onOpenMap(): void;
  onOpenLab(): void;
  onOpenFeedback(): void;
}

export function Sidebar({
  activeView,
  onOpenChat,
  onOpenSettings,
  onOpenMap,
  onOpenLab,
  onOpenFeedback,
}: SidebarProps) {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const openConversation = useChatStore((state) => state.openConversation);
  const startNewConversation = useChatStore((state) => state.startNewConversation);

  const viewButtonClass = (active: boolean) =>
    `block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
      active ? "bg-amber-100 text-stone-700" : "text-stone-500 hover:bg-stone-100"
    }`;

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
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {conversations.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            onClick={() => {
              void openConversation(conversation.id);
              onOpenChat();
            }}
            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              conversation.id === activeConversationId && activeView === "chat"
                ? "bg-amber-100 text-stone-800"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {conversation.title}
          </button>
        ))}
      </nav>
      <TrailPanel />
      <div className="m-3 space-y-1">
        <button type="button" onClick={onOpenMap} className={viewButtonClass(activeView === "map")}>
          🏛️ 记忆宫殿
        </button>
        <button type="button" onClick={onOpenLab} className={viewButtonClass(activeView === "lab")}>
          🧪 实验室
        </button>
        <button
          type="button"
          onClick={onOpenFeedback}
          className={viewButtonClass(activeView === "feedback")}
        >
          🪞 反馈实验室
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={viewButtonClass(activeView === "settings")}
        >
          ⚙️ 设置
        </button>
      </div>
    </aside>
  );
}
