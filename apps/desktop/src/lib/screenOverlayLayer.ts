/**
 * Purpose: the keyboard and screen-reader plumbing a full-screen layer needs — a stack of open
 * layers so Escape closes the top one only (a reader opened from the 收藏 list must not close the
 * list underneath it), the rest of the page taken out of the tab order and out of screen readers
 * while a layer is up, and focus handed back to whatever opened the layer when it goes away.
 * Main exports: openScreenOverlayLayer.
 */

interface WithdrawnElement {
  element: Element;
  inert: string | null;
  ariaHidden: string | null;
}

export interface ScreenOverlayLayerOptions {
  /**
   * The layer's own top-level element in the body: it takes focus when the layer opens, and every
   * other child of the body is withdrawn while the layer is up.
   */
  element: HTMLElement;
  /** Called when Escape is pressed and this layer is the top one. */
  onRequestClose(): void;
}

const openLayers: ScreenOverlayLayerOptions[] = [];

// Escape is read once for the whole stack, so the answer never depends on which component
// registered its listener first. A layer below can still claim the key with preventDefault,
// following FocusOverlay's pattern.
function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  openLayers.at(-1)?.onRequestClose();
}

/** Everything else in the body — the app shell, and any layer already open below this one. */
function withdrawEverythingElse(layerElement: HTMLElement): WithdrawnElement[] {
  const withdrawn: WithdrawnElement[] = [];
  for (const element of Array.from(document.body.children)) {
    if (element === layerElement) continue;
    withdrawn.push({
      element,
      inert: element.getAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    });
    element.setAttribute("inert", "");
    element.setAttribute("aria-hidden", "true");
  }
  return withdrawn;
}

function restoreWithdrawn(withdrawn: readonly WithdrawnElement[]): void {
  for (const one of withdrawn) {
    // Back to what it was, which for a layer still open underneath is "withdrawn".
    if (one.inert === null) one.element.removeAttribute("inert");
    else one.element.setAttribute("inert", one.inert);
    if (one.ariaHidden === null) one.element.removeAttribute("aria-hidden");
    else one.element.setAttribute("aria-hidden", one.ariaHidden);
  }
}

/**
 * Puts a layer on top of the stack and returns the close, which undoes everything in reverse.
 * Layers close innermost first, which is what unmounting nested React components does on its own.
 */
export function openScreenOverlayLayer(options: ScreenOverlayLayerOptions): () => void {
  const previouslyFocused = document.activeElement;
  const withdrawn = withdrawEverythingElse(options.element);
  openLayers.push(options);
  if (openLayers.length === 1) document.addEventListener("keydown", onDocumentKeyDown);
  // preventScroll on both focus moves: the page behind is being held in place, and a focus call
  // is otherwise allowed to scroll it to the element it lands on.
  options.element.focus({ preventScroll: true });

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const index = openLayers.lastIndexOf(options);
    if (index !== -1) openLayers.splice(index, 1);
    if (openLayers.length === 0) document.removeEventListener("keydown", onDocumentKeyDown);
    restoreWithdrawn(withdrawn);
    if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
      previouslyFocused.focus({ preventScroll: true });
    }
  };
}

/** How many layers are open right now — the stack's only reader outside itself is its test. */
export function openScreenOverlayLayerCount(): number {
  return openLayers.length;
}
