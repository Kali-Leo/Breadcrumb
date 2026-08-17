/**
 * Purpose: what the reader sees when an item cannot be shown inside the app (spec 053 §7) — one
 * plain line saying what happened from the reader's side, and the way onward: the original page
 * in the browser. No error text, no code, no retry loop.
 * Main exports: DiscoveryReaderFallback.
 */
import { openUrl } from "@tauri-apps/plugin-opener";

interface DiscoveryReaderFallbackProps {
  line: string;
  url: string | null;
  /** How far down the pane it sits: low on an otherwise empty page, close up under a player. */
  className?: string;
}

export function DiscoveryReaderFallback({
  line,
  url,
  className = "mt-16",
}: DiscoveryReaderFallbackProps) {
  return (
    <div className={`text-center ${className}`}>
      <p className="text-sm text-stone-500">{line}</p>
      {url !== null && (
        <button
          type="button"
          onClick={() => void openUrl(url)}
          className="mt-4 rounded-xl border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          在浏览器打开
        </button>
      )}
    </div>
  );
}
