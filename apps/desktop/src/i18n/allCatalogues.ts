/**
 * Purpose: every shipped language at once, for the tests that compare them.
 *
 * catalogues.ts loads one language at a time, which is what the running app wants and what
 * keeps the first screen small. The completeness gates want the opposite — they exist to say
 * "these eleven agree with each other" — so the eager glob lives here, in a module no
 * application code imports. Nothing reaches it from main.tsx, so nothing it pulls in reaches
 * a build.
 *
 * Main exports: resources.
 */
import type { Resource, ResourceLanguage } from "i18next";
import { LOCALE_PATH } from "./catalogues";

const catalogueModules = import.meta.glob<{ default: ResourceLanguage }>("../locales/*/*.json", {
  eager: true,
});

function discoverCatalogues(): Resource {
  const found: Resource = {};
  for (const [path, module] of Object.entries(catalogueModules)) {
    const match = LOCALE_PATH.exec(path);
    if (match === null) continue;
    const [, code, namespace] = match as unknown as [string, string, string];
    const language = found[code] ?? {};
    language[namespace] = module.default;
    found[code] = language;
  }
  return found;
}

export const resources: Resource = discoverCatalogues();
