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

/** The package a module belongs to, read from the last `node_modules/` segment so pnpm's
 * `.pnpm/<name>@<version>/node_modules/<name>/…` layout answers with the real package rather
 * than the store directory. */
function packageOf(id: string): string | undefined {
  const marker = "/node_modules/";
  const at = id.lastIndexOf(marker);
  if (at === -1) return undefined;
  const [scopeOrName, scoped] = id.slice(at + marker.length).split("/");
  if (scopeOrName === undefined) return undefined;
  if (!scopeOrName.startsWith("@")) return scopeOrName;
  return scoped === undefined ? undefined : `${scopeOrName}/${scoped}`;
}

/**
 * Every package mermaid pulls in that nothing else in the app imports — the whole tree under
 * `pnpm why`, minus the ones Recharts, KaTeX or the comparison tree also use.
 *
 * Naming them is not a size optimisation, it is the fix for a white screen. Several of these
 * packages ship pure re-export files (`@mermaid-js/parser`'s per-diagram facades are two
 * imports and an export list), which render to zero bytes once Rollup has resolved them.
 * Rollup's `experimentalMinChunkSize` then folds those empty chunks into whatever neighbour it
 * likes — and it chose the chunk holding TrendLineChart, a component the map and vocabulary
 * views import. That handed both views a *static* import of the 3.0 MB mermaid chunk: 815 KB
 * gzip wasted online, and offline (the service worker deliberately does not precache mermaid)
 * an uncaught TypeError that emptied #root. A module that has a manual chunk cannot be merged
 * into someone else's, so listing them is what keeps mermaid on the far side of the one
 * dynamic `import("mermaid")` in MermaidBlock.tsx.
 *
 * Deliberately absent: `es-toolkit`, `internmap`, `d3-array`, `d3-path`, `d3-shape`, `katex`.
 * Recharts, the comparison tree or the chat markdown reach into those too, so claiming them
 * for mermaid would point the arrow the other way and make the charts chunk import mermaid —
 * the same bug, wearing the other hat.
 */
const MERMAID_ONLY = new Set([
  "@braintree/sanitize-url",
  "@iconify/utils",
  "@mermaid-js/parser",
  "@upsetjs/venn.js",
  "cose-base",
  "cytoscape",
  "cytoscape-cose-bilkent",
  "cytoscape-fcose",
  "d3",
  "dagre-d3-es",
  "dayjs",
  "dompurify",
  "khroma",
  "layout-base",
  "lodash-es",
  "marked",
  "mermaid",
  "roughjs",
  "stylis",
  "ts-dedent",
  "uuid",
]);

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
  // Recharts and its d3 are claimed BEFORE mermaid on purpose. Mermaid bundles the whole `d3`
  // umbrella, so most `d3-*` packages are in fact only reached through it — but a rule that
  // let any of them drift into the mermaid group would mean the day someone reaches for
  // d3-zoom in a view, that view starts statically importing mermaid again. Charts first is
  // the invariant: the arrow only ever points mermaid → charts, never back.
  if (isPackage(id, "recharts") || id.includes("/node_modules/d3-")) return "charts";
  const pkg = packageOf(id);
  if (pkg !== undefined && MERMAID_ONLY.has(pkg)) return "mermaid";
  if (isPackage(id, "react") || isPackage(id, "react-dom") || isPackage(id, "scheduler")) {
    return "react";
  }
  return undefined;
}
