/**
 * Purpose: the two ways a browsing event can reach this app, and nothing else. Both hand what
 * they carried to the same entry function (./browsingIntake), so there is exactly one place
 * where an event is checked, classified and stored.
 *
 * Desktop — the browser script cannot see this app's database, so it posts to a listener bound
 * to 127.0.0.1 (src-tauri/src/collector.rs). That listener writes what it accepted to a small
 * file, and this module drains the file. The listener runs whenever the app does; draining
 * happens when the discovery page is open, which is why a spool exists at all.
 *
 * Browser — a page served over https cannot be posted to by a script on another site, and
 * should not be. So the script also runs on this app's own page and hands its queue over with
 * `window.postMessage`. Two things are checked, and they are the whole security of it: the
 * message must come from this exact origin, and its source must be this very window. A message
 * from a frame, an opener, an extension page or any other origin is dropped unread.
 *
 * Main exports: drainCollectorSpool, listenForPageDeliveries, readPairingInfo, PAGE_CHANNEL.
 */
import { invoke } from "@tauri-apps/api/core";
import { receiveBrowsingEvents } from "./browsingIntake";
import { isBrowserEdition } from "./edition";
import { degradeSilently } from "./failureLog";

/** The name every message on the page channel carries. Namespaced so nothing else on the page
 * can be mistaken for it, and versioned so a newer script and an older page can tell. */
export const PAGE_CHANNEL = "breadcrumb.browsing/1";

/** What the setup card shows so a browser can connect. */
export interface PairingInfo {
  readonly port: number;
  /** Empty once it has been used; the page asks for a new one when it wants another browser. */
  readonly pairingCode: string;
  readonly paired: number;
}

/** The single string a learner copies: it carries where to post and the one-time secret, so
 * there is one thing to move rather than two. */
export function connectionCode(info: PairingInfo): string {
  return `${info.port}-${info.pairingCode}`;
}

/**
 * Where the local listener is and how to connect to it. Null in the browser edition, which has
 * no listener at all — there the page channel is the only way in.
 *
 * `mint` asks for a fresh code when the last one has been used up. It is a parameter rather
 * than automatic because the code is displayed: minting on every poll would swap the code out
 * from under someone in the middle of copying it.
 */
export async function readPairingInfo(mint: boolean): Promise<PairingInfo | null> {
  if (isBrowserEdition()) return null;
  try {
    return await invoke<PairingInfo>("browsing_collector_info", { mintCode: mint });
  } catch (error) {
    void degradeSilently("browsing-collector", error);
    return null;
  }
}

/** Everything the local listener has taken in since the last drain. Returns how many events
 * were new, so a caller can refresh the panels only when something actually changed. */
export async function drainCollectorSpool(): Promise<number> {
  if (isBrowserEdition()) return 0;
  try {
    const events = await invoke<unknown[]>("take_browsing_events");
    if (events.length === 0) return 0;
    return (await receiveBrowsingEvents(events)).stored;
  } catch (error) {
    void degradeSilently("browsing-collector", error);
    return 0;
  }
}

export interface PageDelivery {
  readonly batch: string;
  readonly events: unknown[];
}

/**
 * A message is only ours if it says so, came from here, and carries a batch of events. Written
 * over plain values rather than over a MessageEvent so the two checks that matter can be tested
 * without a browser: `origin` must be this page's own, and `source` must be this very window —
 * an iframe, an opener or an extension page is a different window on, at best, the same origin.
 */
export function pageDeliveryOf(
  message: { readonly origin: string; readonly source: unknown; readonly data: unknown },
  self: { readonly origin: string; readonly window: unknown },
): PageDelivery | null {
  if (message.origin !== self.origin) return null;
  if (message.source !== self.window) return null;
  const data = message.data;
  if (data === null || typeof data !== "object") return null;
  const fields = data as Record<string, unknown>;
  if (fields.channel !== PAGE_CHANNEL || fields.kind !== "events") return null;
  if (!Array.isArray(fields.events)) return null;
  return { batch: typeof fields.batch === "string" ? fields.batch : "", events: fields.events };
}

/**
 * Opens the page channel and announces that it is open — a script that loaded before this page
 * did would otherwise sit on its queue forever waiting to be asked. Returns the function that
 * closes it again.
 */
export function listenForPageDeliveries(onStored: (stored: number) => void): () => void {
  const handler = (event: MessageEvent): void => {
    const delivery = pageDeliveryOf(event, { origin: window.location.origin, window });
    if (delivery === null) return;
    void receiveBrowsingEvents(delivery.events).then((result) => {
      // The acknowledgement is what lets the script drop the batch from its own queue. It is
      // sent after the write, so nothing is dropped on the strength of a promise.
      window.postMessage(
        { channel: PAGE_CHANNEL, kind: "stored", batch: delivery.batch },
        window.location.origin,
      );
      if (result.stored > 0) onStored(result.stored);
    });
  };
  window.addEventListener("message", handler);
  window.postMessage({ channel: PAGE_CHANNEL, kind: "ready" }, window.location.origin);
  return () => window.removeEventListener("message", handler);
}
