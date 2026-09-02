/**
 * Purpose: where a message catalogue comes from, one language at a time.
 *
 * All eleven languages used to be bundled eagerly — 163 KiB gzipped sitting on the browser
 * edition's critical path so that ten of them could go unread. The desktop build reads them
 * off local disk and never noticed; a learner on a slow connection pays for it on every first
 * visit. Loading only the language in use (and the fallback behind it) is the same code path
 * on both builds, and Vite gives each language its own chunk (see vite.chunks.ts), so
 * switching language fetches one small file.
 *
 * The eleven-language completeness checks still need all of them at once; they import
 * allCatalogues.ts, which globs eagerly and is never reached from application code.
 *
 * Main exports: loadCatalogue, LOCALE_PATH.
 */
import type { ResourceLanguage } from "i18next";

/** Lazy on purpose — see the note above. `eager: false` is the default and stated anyway,
 * because the whole point of this module is that it is not eager. */
const catalogueModules = import.meta.glob<{ default: ResourceLanguage }>("../locales/*/*.json", {
  eager: false,
});

/** `../locales/<code>/<namespace>.json` */
export const LOCALE_PATH = /\/locales\/([^/]+)\/([^/]+)\.json$/;

/** Every namespace of one language, or an empty object when no such language ships. The
 * caller decides what a missing language means; here it is simply "nothing to add". */
export async function loadCatalogue(code: string): Promise<ResourceLanguage> {
  const language: ResourceLanguage = {};
  const loads: Promise<void>[] = [];
  for (const [path, load] of Object.entries(catalogueModules)) {
    const match = LOCALE_PATH.exec(path);
    if (match === null || match[1] !== code) continue;
    const namespace = match[2] as string;
    loads.push(
      load().then((module) => {
        language[namespace] = module.default;
      }),
    );
  }
  await Promise.all(loads);
  return language;
}
