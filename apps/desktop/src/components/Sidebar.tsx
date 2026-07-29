/**
 * Purpose: left column — new-chat button, conversation list, settings entry.
 * Main exports: Sidebar.
 */
import { useChatStore } from "../stores/chatStore";
import { TrailPanel } from "./TrailPanel";

interface SidebarProps {
  onOpenSettings(): void;
  onOpenMap(): void;
}

export function Sidebar({ onOpenSettings, onOpenMap }: SidebarProps) {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const openConversation = useChatStore((state) => state.openConversation);
  const startNewConversation = useChatStore((state) => state.startNewConversation);

  return (
    <aside className="flex h-full w-60 flex-col border-r border-stone-200 bg-white">
      <div className="flex items-center gap-2 p-3">
        <span className="text-xl">🍞</span>
        <span className="font-semibold text-stone-700">Breadcrumb</span>
      </div>
      <button
        type="button"
        onClick={startNewConversation}
        className="mx-3 mb-2 rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm text-amber-600 transition-colors hover:bg-amber-50"
      >
        ＋ 新的学习对话
      </button>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2">
        {conversations.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            onClick={() => void openConversation(conversation.id)}
            className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              conversation.id === activeConversationId
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
        <button
          type="button"
          onClick={onOpenMap}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-500 transition-colors hover:bg-stone-100"
        >
          🗺️ 知识地图
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-500 transition-colors hover:bg-stone-100"
        >
          ⚙️ 设置
        </button>
      </div>
    </aside>
  );
}
