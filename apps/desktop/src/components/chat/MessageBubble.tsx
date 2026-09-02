/**
 * Purpose: renders one chat message (user right-aligned amber, assistant left-aligned
 * neutral). Assistant messages render as markdown with KaTeX math; the diglot weave
 * (spec 033) and explore doors (spec 039) both apply to the same normalized display
 * source, so patch offsets always match the screen. While weaving is enabled, assistant
 * text stays blank until its patches are cached (weave-before-first-paint, Leo 2026-08-16)
 * — the original is never painted and then morphed. A door click or a selection+Enter both
 * open a focus session directly — no guess, no popover (spec 042 §5) — anchored to this
 * message's id so its in-place badge (Leo 2026-08-14) can find its way back. Storage and LLM
 * context keep the original text untouched.
 * Main exports: MessageBubble.
 */
import { memo, useEffect, useMemo, useRef } from "react";
import { normalizeMathDelimiters } from "../../lib/chat/markdownMath";
import { recordMessageReencounter } from "../../lib/knowledge/reencounter";
import { useDiglotStore } from "../../stores/diglotStore";
import { useDoorStore } from "../../stores/doorStore";
import { useFocusStore } from "../../stores/focusStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { SelectionFocusCatcher } from "../focus/SelectionFocusCatcher";
import { MarkdownContent } from "./MarkdownContent";

interface MessageBubbleProps {
  author: "user" | "assistant" | "system";
  content: string;
  /** The conversation this bubble belongs to — passed by its window, never read from the
   * active binding (a popup renders another conversation's bubbles at the same time). */
  conversationId: string | null;
  /** Present for persisted messages; streaming previews have none and are never woven. */
  messageId?: string;
}

function MessageBubbleBody({ author, content, conversationId, messageId }: MessageBubbleProps) {
  const isUser = author === "user";
  const bubbleRef = useRef<HTMLDivElement>(null);
  const diglotEnabled = useDiglotStore((state) => state.settings.enabled);
  const diglotHydrated = useDiglotStore((state) => state.settingsHydrated);
  const diglotPackLoaded = useDiglotStore((state) => state.loaded !== null);
  const patches = useDiglotStore((state) =>
    messageId === undefined ? undefined : state.patchesByMessage.get(messageId),
  );

  // The display source: math delimiters normalized for remark-math. Weaving runs on the
  // same string so diglot patch offsets and markdown node offsets agree.
  const displaySource = useMemo(
    () => (isUser ? content : normalizeMathDelimiters(content)),
    [isUser, content],
  );

  const shouldWeave = diglotEnabled && author === "assistant" && messageId !== undefined;
  // diglotPackLoaded is a dep on purpose: an early bubble rendered while the pack was
  // still loading must retry once it lands, or its gate below would blank forever.
  useEffect(() => {
    if (shouldWeave && diglotPackLoaded && messageId !== undefined) {
      void useDiglotStore.getState().ensureWoven(messageId, displaySource);
    }
  }, [shouldWeave, diglotPackLoaded, messageId, displaySource]);

  // Weave-before-first-paint gate (Leo 2026-08-16): a persisted assistant message must
  // never paint its original and then re-render woven. While weaving is enabled (or its
  // settings are not yet hydrated) and this message's patches are not yet cached, render
  // nothing — the base weave resolves in milliseconds from the local pack, and a freshly
  // streamed reply was already woven by ensureWovenBeforeReveal before the swap, so its
  // first render never waits here. Weaving off → the original renders immediately.
  const weavePending =
    author === "assistant" &&
    messageId !== undefined &&
    (!diglotHydrated || (diglotEnabled && patches === undefined));

  // Explore doors (spec 039 §2.1): zero-LLM, so no settings gate. Waits for the diglot weave
  // to finish first (when weaving is on) so reservedSpans reflects the truth — `patches`
  // stays undefined until the weave's FINAL patches land in the store, even as [].
  const doorsForMessage = useDoorStore((state) =>
    messageId === undefined || conversationId === null
      ? undefined
      : state.doorsByConversation.get(conversationId)?.get(messageId),
  );
  useEffect(() => {
    if (author !== "assistant" || messageId === undefined || conversationId === null) return;
    if (diglotEnabled && patches === undefined) return;
    // doorsForMessage is a dep on purpose: the nodesExtracted invalidation clears empty
    // entries, and this effect re-running is what recomputes them with real sightings.
    if (doorsForMessage !== undefined) return;
    void useDoorStore.getState().ensureDoors(messageId, displaySource, conversationId);
  }, [author, messageId, diglotEnabled, patches, displaySource, doorsForMessage, conversationId]);

  // Silent re-encounter (vision/09): an assistant message dwelled on ≥50%-visible for 2s
  // re-sights its attributed nodes — rereading old ground is a review, at message grain.
  useEffect(() => {
    const element = bubbleRef.current;
    if (element === null || isUser || messageId === undefined) return;
    let dwellTimer: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && dwellTimer === null) {
            dwellTimer = window.setTimeout(() => {
              if (conversationId !== null) {
                void recordMessageReencounter(messageId, conversationId);
              }
            }, 2000);
          } else if (!entry.isIntersecting && dwellTimer !== null) {
            window.clearTimeout(dwellTimer);
            dwellTimer = null;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      if (dwellTimer !== null) window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [isUser, messageId, conversationId]);

  // A marked word or a selection both open a focus session directly — no guess, no popover
  // (spec 042 §5). Silently does nothing while the switch is off or no conversation is open;
  // the marks/selection hint themselves stay visible either way.
  const openFocus = (rootLabel: string) => {
    if (conversationId === null) return;
    if (!useSettingsStore.getState().featureSwitches.focusExplain) return;
    void useFocusStore
      .getState()
      .startFromWord(conversationId, rootLabel, displaySource, messageId ?? null);
  };
  const openFocusFromDoor = (word: string, nodeId: string | null) => {
    // A term-marked word with no matching knowledge node has nothing to mark "opened"
    // (spec 043 §6) — it still opens a focus session directly, same as any other door.
    if (nodeId !== null && conversationId !== null)
      useDoorStore.getState().markOpened(conversationId, nodeId);
    openFocus(word);
  };

  const woven =
    shouldWeave && messageId !== undefined && patches !== undefined && patches.length > 0;
  return (
    <div ref={bubbleRef} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[76%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? "whitespace-pre-wrap bg-amber-100 text-stone-800"
            : "bg-white text-stone-800 shadow-sm"
        }`}
      >
        {isUser ? (
          content
        ) : weavePending ? null : (
          <SelectionFocusCatcher onConfirm={openFocus}>
            <MarkdownContent
              source={displaySource}
              diglot={
                woven && messageId !== undefined ? { messageId, patches: patches ?? [] } : undefined
              }
              doors={
                doorsForMessage !== undefined && doorsForMessage.length > 0
                  ? { patches: doorsForMessage, onSelect: openFocusFromDoor }
                  : undefined
              }
            />
          </SelectionFocusCatcher>
        )}
      </div>
    </div>
  );
}

/** Streaming writes the store once per delta and ChatView re-maps the whole message list, so
 * without this every settled bubble re-parsed its markdown and re-rendered its KaTeX on every
 * token of the reply being typed (design audit 2026-08-28, 数据层与性能 #3). Every prop is a
 * primitive (author, content, conversationId, messageId) — the default shallow comparison is
 * exactly the right one, so no custom comparator. */
export const MessageBubble = memo(MessageBubbleBody);
