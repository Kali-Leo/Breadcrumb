/**
 * Purpose: the message history itself, windowed (backlog / 2026-08-16 audit item "长消息列表
 * 虚拟化"). A conversation kept for months grows without bound, and every assistant row can
 * carry Markdown, KaTeX and a Mermaid diagram — rendering all of them to keep twenty on
 * screen is the kind of cost that only shows up on the machine of whoever uses the app most.
 *
 * The three behaviours the plain list had are the reason this is a component rather than a
 * one-line swap, and each is preserved deliberately:
 *  - **stick to the bottom while streaming**, but never yank someone who scrolled up to read
 *    (Virtuoso's `followOutput="auto"`, which only follows when already at the bottom);
 *  - **locate a message** from the station map, including one that is far out of the window
 *    (scrollToIndex by index, not a DOM query, which cannot find an unrendered row);
 *  - **open at the newest message**, without a visible scroll-down on entry.
 * Main exports: MessageList, MessageListHandle.
 */
import type { MessageRow } from "@breadcrumb/core-db";
import { forwardRef, type ReactNode, useImperativeHandle, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";

export interface MessageListHandle {
  /** Brings one message into view, wherever it is in the history. */
  scrollToMessage(messageId: string): void;
  /** Jumps to the newest message and re-sticks. */
  scrollToBottom(): void;
}

interface MessageListProps {
  messages: readonly MessageRow[];
  renderMessage(message: MessageRow): ReactNode;
  /** Streaming reply, error banner — anything that belongs after the last message. */
  footer: ReactNode;
  onAtBottomChange(atBottom: boolean): void;
}

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
  { messages, renderMessage, footer, onAtBottomChange },
  ref,
) {
  const virtuoso = useRef<VirtuosoHandle>(null);

  useImperativeHandle(ref, () => ({
    scrollToMessage(messageId: string) {
      const index = messages.findIndex((message) => message.id === messageId);
      if (index === -1) return;
      virtuoso.current?.scrollToIndex({ index, align: "center", behavior: "smooth" });
    },
    scrollToBottom() {
      virtuoso.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "auto" });
    },
  }));

  return (
    <Virtuoso
      ref={virtuoso}
      data={messages as MessageRow[]}
      // Opening a conversation lands on its newest message, the way closing and reopening a
      // chat does everywhere else.
      initialTopMostItemIndex={Math.max(0, messages.length - 1)}
      followOutput="auto"
      atBottomStateChange={onAtBottomChange}
      // Room for one screen of history above and below the viewport: enough that ordinary
      // scrolling never shows a blank patch, small enough that the point of windowing stands.
      increaseViewportBy={{ top: 600, bottom: 600 }}
      className="h-full"
      itemContent={(_index, message) => <div className="px-4 pb-3">{renderMessage(message)}</div>}
      components={{
        Header: () => <div className="h-4" />,
        Footer: () => <div className="px-4 pb-4">{footer}</div>,
      }}
    />
  );
});
