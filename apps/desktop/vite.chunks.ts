/**
 * Purpose: the vendor grouping both builds share. Rollup's default is one chunk per entry plus
 * one per dynamic import, which put React, Pixi, Recharts, KaTeX and every message catalogue in
 * the same file — a single 6.9 MB download before the first pixel. Grouping them means a
 * browser can cache React across a release that only changed the app, and a view that never
 * opens never fetches its library.
 *
 * Two rules learned from other people's breakages (vitejs/vite #12209, #17653): React and
 * react-dom stay in ONE group, never split from each other; and a group is only ever reached
 * through the code that imports it, so a library that is dynamically imported everywhere stays
 * lazy. Anything not named here keeps Rollup's own answer.
 *
 * Main exports: manualChunks.
 */

/** Node module paths carry the package name between separators; matching on that rather than a
 * bare substring keeps `react` from claiming `react-i18next`. */
function isPackage(id: string, name: string): boolean {
  return id.includes(`/node_modules/${name}/`) || id.includes(`/node_modules/.pnpm/${name}@`);
}

export function manualChunks(id: string): string | undefined {
  // The occupation datasets are megabytes of generated data, dynamically imported by design.
  // Naming them keeps the size warning legible instead of pointing at a hashed filename.
  if (id.includes("/data/generated/escoDataset")) return "escoDataset";
  if (id.includes("/data/generated/onetDataset")) return "onetDataset";
  // One chunk per interface language. i18n/catalogues.ts imports them lazily, so grouping the
  // eleven together would undo that: a named group is one file, and one file is fetched whole
  // the moment any language in it is asked for. Chinese is the source catalogue and is
  // imported statically, so its chunk is the only one on the first paint's path.
  const locale = /\/apps\/desktop\/src\/locales\/([^/]+)\//.exec(id)?.[1];
  if (locale !== undefined) return `locale-${locale}`;
  // The i18n machinery itself, plus the library that reads the catalogues. Needed for the
  // first paint, but as its own file it downloads beside the entry rather than inside it.
  if (id.includes("/apps/desktop/src/i18n/")) return "i18n";
  if (!id.includes("node_modules")) return undefined;
  if (isPackage(id, "i18next") || isPackage(id, "react-i18next")) return "i18n";
  if (isPackage(id, "pixi.js")) return "pixi";
  if (isPackage(id, "katex")) return "katex";
  if (isPackage(id, "mermaid") || isPackage(id, "cytoscape")) return "mermaid";
  if (isPackage(id, "recharts") || id.includes("/node_modules/d3-")) return "charts";
  if (isPackage(id, "react") || isPackage(id, "react-dom") || isPackage(id, "scheduler")) {
    return "react";
  }
  return undefined;
}
