/**
 * Purpose: which language pairs exist, which ones this machine has, and how a new one gets
 * here. One pair (zh→en) ships inside the app; the rest are downloaded when the learner picks
 * them — a few dozen pairs at a megabyte or two each would otherwise double the installer for
 * data almost nobody uses all of.
 *
 * The downloaded file is stored in the database rather than on disk, so the browser build
 * installs packs through exactly the same path as the desktop one. Nothing about the learner
 * is sent when a pack is fetched: it is a plain GET of a public dictionary file.
 * Side effects: network (install only), DB writes.
 * Main exports: PACK_CATALOG, CatalogPack, catalogPackFor, installLanguagePack, loadPack,
 * listInstalledPairs, BUNDLED_PAIR_ID.
 */
import type { DiglotPairId } from "@breadcrumb/core-db";
import { type LoadedLanguagePack, loadLanguagePack } from "@breadcrumb/feature-diglot-weave";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import catalogJson from "../../assets/language-packs/catalog.json";
import { useSettingsStore } from "../../stores/settingsStore";
import { getRepos } from "../platform/db";
import { isBrowserEdition } from "../platform/edition";
import { NetworkDisabledError } from "../platform/llmConfig";
import { nowIso } from "../platform/time";

export interface CatalogPack {
  /** `${source}:${target}` — the pair id the rest of the weave uses. */
  id: string;
  file: string;
  sourceLang: string;
  targetLang: string;
  version: string;
  entryCount: number;
  /** Entries the weave may actually swap in; the rest exist for lookup only. */
  weavableCount: number;
  /** Uncompressed size, shown to the learner before they agree to the download. */
  bytes: number;
  /** SHA-256 of the pack file, checked in `installLanguagePack` before anything is stored. */
  sha256: string;
}

interface Catalog {
  generatedAt: string;
  downloadBase: string;
  packs: CatalogPack[];
}

const catalog = catalogJson as Catalog;

/** The one pair inside the installer: everyone who reads Chinese can learn English offline,
 * out of the box, with no download and no account. */
export const BUNDLED_PAIR_ID = "zh:en";

/** Every pair that can be had, bundled one first, then the downloadable ones in id order. */
export const PACK_CATALOG: readonly CatalogPack[] = catalog.packs;

export function catalogPackFor(pairId: string): CatalogPack | null {
  return PACK_CATALOG.find((pack) => pack.id === pairId) ?? null;
}

/**
 * Where a pack is fetched from, which is not the same place in the two builds.
 *
 * The desktop build asks GitHub Releases directly. A browser cannot: the release asset
 * redirects to a second host and neither hop sends `access-control-allow-origin`, so the fetch
 * fails before it has even followed the redirect — measured 2026-09-02, and it made every one
 * of the eight downloadable pairs impossible to install in the browser edition. So that build
 * reads the packs from its own site instead, where being same-origin makes the question moot;
 * the deploy workflow copies the very same release assets into the site. The digest check
 * afterwards is unchanged and still the thing that decides whether a pack is trusted.
 */
function downloadUrlFor(pack: CatalogPack): string {
  if (isBrowserEdition()) return `${import.meta.env.BASE_URL}language-packs/${pack.file}`;
  return `${catalog.downloadBase}-${pack.version}/${pack.file}`;
}

const packCache = new Map<DiglotPairId, Promise<LoadedLanguagePack>>();

async function readBundledPack(): Promise<LoadedLanguagePack> {
  const raw = (await import("../../assets/language-packs/zh-en.json")).default;
  return loadLanguagePack(raw);
}

/** The pack for one pair: bundled, or the copy this machine downloaded. Throws when the pair
 * is not installed — the caller decides whether that is an error or an invitation to install. */
export function loadPack(pairId: DiglotPairId): Promise<LoadedLanguagePack> {
  let cached = packCache.get(pairId);
  if (cached === undefined) {
    cached = (async () => {
      if (pairId === BUNDLED_PAIR_ID) return readBundledPack();
      const repos = await getRepos();
      const payload = await repos.diglot.getPackPayload(pairId);
      if (payload === null) throw new Error(`language pack not installed: ${pairId}`);
      return loadLanguagePack(JSON.parse(payload));
    })();
    packCache.set(pairId, cached);
  }
  return cached;
}

/** Pairs this machine can weave right now. */
export async function listInstalledPairs(): Promise<string[]> {
  const repos = await getRepos();
  const rows = await repos.diglot.listPacks();
  const installed = new Set<string>([BUNDLED_PAIR_ID, ...rows.map((row) => row.id)]);
  return [...installed].sort();
}

/** Lowercase hex SHA-256 of a string, via the WebCrypto both builds already have.
 *
 * `crypto.subtle` is [SecureContext]-gated and is simply absent on an origin that is not one
 * — plain http, which is what a `vite preview` opened from an iPad over the LAN is. The check
 * is the only thing standing between a swapped release asset and a poisoned dictionary, so
 * there is nothing to fall back to and nothing to skip: the download is refused, and the
 * sentence says which of the two problems it is, because "checksum mismatch" would send
 * someone hunting a corrupt file that is perfectly fine. */
async function sha256Hex(text: string): Promise<string> {
  if (crypto.subtle === undefined) {
    throw new Error(
      "cannot verify the language pack: WebCrypto is unavailable on this origin " +
        "(it needs https or localhost), and an unverified pack is never installed",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Downloads one pack and stores it. Checked against the digest the catalog was built with —
 * which ships inside the installer — before anything is parsed or saved, so a release asset
 * swapped for a poisoned dictionary is refused here rather than quietly teaching someone the
 * attacker's definitions. Then validated against the pack contract, so a truncated download
 * fails here rather than halfway through a conversation.
 */
export async function installLanguagePack(pairId: string): Promise<void> {
  const pack = catalogPackFor(pairId);
  if (pack === null) throw new Error(`unknown language pair: ${pairId}`);
  // The network switch is a promise to the user, and it covers this download too: the request
  // carries no user data, but it still reveals that this machine runs Breadcrumb.
  if (!useSettingsStore.getState().networkEnabled) throw new NetworkDisabledError();
  const response = await tauriFetch(downloadUrlFor(pack), { method: "GET" });
  if (!response.ok) {
    throw new Error(`language pack download failed: ${response.status}`);
  }
  const text = await response.text();
  const digest = await sha256Hex(text);
  if (digest !== pack.sha256) {
    throw new Error(`language pack checksum mismatch for ${pairId}`);
  }
  const parsed = loadLanguagePack(JSON.parse(text));
  if (parsed.pack.id !== pairId) {
    throw new Error(`language pack mismatch: asked for ${pairId}, got ${parsed.pack.id}`);
  }
  const repos = await getRepos();
  await repos.diglot.upsertPack({
    id: pairId,
    source_lang: parsed.pack.sourceLang,
    target_lang: parsed.pack.targetLang,
    version: parsed.pack.version,
    meta_json: JSON.stringify({
      attribution: parsed.pack.attribution,
      capabilities: parsed.pack.capabilities,
      entryCount: Object.keys(parsed.pack.entries).length,
    }),
    installed_at: nowIso(),
    payload_json: text,
  });
  packCache.set(pairId, Promise.resolve(parsed));
}

/** Removes a downloaded pack. Word states stay: re-installing must not lose what was learned. */
export async function removeLanguagePack(pairId: string): Promise<void> {
  if (pairId === BUNDLED_PAIR_ID) return;
  const repos = await getRepos();
  await repos.diglot.deletePack(pairId);
  packCache.delete(pairId);
}
