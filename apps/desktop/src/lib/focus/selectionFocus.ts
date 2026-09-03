/**
 * Purpose: the one "select some text, then turn it into a focus station" rule, shared by the
 * chat bubble (SelectionFocusCatcher) and the focus overlay's own pane (FocusContentPane) —
 * the two had carried the same forty lines twice, and only one of the copies ever got fixed.
 *
 * Two input modes, two event streams, on purpose:
 *  * fine pointer — `mouseup`, exactly as before: the hint appears when the drag ends, never
 *    mid-drag, and Enter confirms. The desktop is the baseline and does not move.
 *  * coarse pointer — `selectionchange`, debounced 250ms (the interval Tiptap's bubble menu
 *    settled on): dragging an iOS selection handle produces no reliable `mouseup` at all, and
 *    a tablet has no Enter key to press while text is selected. What the finger gets instead
 *    is a real button, drawn by SelectionFocusPrompt.
 *
 * `getSelection()` hands back the same object every time, so nothing here puts it in state —
 * only the `{ text, rect }` value it is read into.
 * Main exports: useSelectionFocus, SelectionCapture, SelectionRect.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useInputMode } from "../platform/inputMode";

/** Dragging a selection handle fires selectionchange dozens of times a second; the prompt
 * appears once the hand stops moving. */
const SELECTION_DEBOUNCE_MS = 250;

/** A viewport rectangle read out of a Range, as plain numbers — the shape floating-ui wants
 * from a virtual reference element, and safe to keep in React state. */
export interface SelectionRect {
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface SelectionCapture {
  /** The trimmed selection, in full — each caller decides how much of it to show. */
  text: string;
  rect: SelectionRect;
}

function toRect(rect: DOMRect): SelectionRect {
  return {
    x: rect.x,
    y: rect.y,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** The current selection, if there is one and it lies inside `container`. */
function readSelection(container: HTMLElement | null): SelectionCapture | null {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? "";
  if (text.length === 0 || selection === null || selection.rangeCount === 0 || container === null) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  return { text, rect: toRect(range.getBoundingClientRect()) };
}

export interface SelectionFocusOptions {
  /** Given the full selected text when the person confirms. */
  onConfirm: (text: string) => void;
  /** Escape dismisses the prompt and stops there — for the overlay, whose own Escape handler
   * would otherwise close the whole session in the same keystroke. */
  claimEscape?: boolean;
}

export interface SelectionFocusState<T extends HTMLElement> {
  /** Put this on the element whose text may be selected. */
  containerRef: RefObject<T | null>;
  selection: SelectionCapture | null;
  confirm: () => void;
}

export function useSelectionFocus<T extends HTMLElement>({
  onConfirm,
  claimEscape = false,
}: SelectionFocusOptions): SelectionFocusState<T> {
  const containerRef = useRef<T>(null);
  const [selection, setSelection] = useState<SelectionCapture | null>(null);
  const inputMode = useInputMode();
  // Refs, not effect deps: onConfirm is a fresh closure every render and the listeners must
  // register once. selectionRef lets the key handler act OUTSIDE a state updater — a side
  // effect inside an updater is double-invoked by React's dev purity check, and that exact
  // bug once opened two sessions per Enter.
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const selectionRef = useRef<SelectionCapture | null>(null);
  selectionRef.current = selection;
  // iOS ignores removeAllRanges(), so a confirmed selection is still selected and the next
  // selectionchange would pop the prompt straight back up. Any new press clears the note.
  const confirmedTextRef = useRef<string | null>(null);

  const confirm = useCallback(() => {
    const current = selectionRef.current;
    if (current === null) return;
    confirmedTextRef.current = current.text;
    onConfirmRef.current(current.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  useEffect(() => {
    function capture() {
      const next = readSelection(containerRef.current);
      setSelection(next !== null && next.text === confirmedTextRef.current ? null : next);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (selectionRef.current === null) return;
      if (event.key === "Enter") {
        confirm();
      } else if (event.key === "Escape") {
        if (claimEscape) event.preventDefault();
        setSelection(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);

    if (inputMode === "fine") {
      const onPressStart = (event: MouseEvent) => {
        confirmedTextRef.current = null;
        if (containerRef.current?.contains(event.target as Node) === true) return;
        setSelection(null);
      };
      document.addEventListener("mouseup", capture);
      document.addEventListener("mousedown", onPressStart);
      return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("mouseup", capture);
        document.removeEventListener("mousedown", onPressStart);
      };
    }

    let timer: number | null = null;
    function onSelectionChange() {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(capture, SELECTION_DEBOUNCE_MS);
    }
    function onPressStart(event: PointerEvent) {
      confirmedTextRef.current = null;
      const target = event.target;
      // The prompt is a button that sits outside the container: a press on it must survive
      // long enough to become a click.
      if (target instanceof Element && target.closest("[data-selection-prompt]") !== null) return;
      if (target instanceof Node && containerRef.current?.contains(target) === true) return;
      setSelection(null);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPressStart);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPressStart);
    };
  }, [confirm, claimEscape, inputMode]);

  return { containerRef, selection, confirm };
}
