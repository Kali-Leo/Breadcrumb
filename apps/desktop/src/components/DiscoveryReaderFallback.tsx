/**
 * Purpose: what the reader sees when an item cannot be shown inside the app (spec 053 §7) — one
 * plain line saying what happened from the reader's side. No error text, no code, no retry loop.
 * The way onward is the reader header's 在浏览器打开, which is on screen the whole time an item
 * is open; this used to repeat that button here, so a failed page offered it twice.
 * Main exports: DiscoveryReaderFallback.
 */

interface DiscoveryReaderFallbackProps {
  line: string;
  /** How far down the pane it sits: low on an otherwise empty page, close up under a player. */
  className?: string;
}

export function DiscoveryReaderFallback({
  line,
  className = "mt-16",
}: DiscoveryReaderFallbackProps) {
  return (
    <div className={`text-center ${className}`}>
      <p className="text-sm text-stone-500">{line}</p>
    </div>
  );
}
