/**
 * Purpose: dev-time bounded Wikidata enrichment for the ESCO dataset (spec 027 T4) — for
 * concepts shared by ≥MIN_OCCUPATIONS occupations, resolve the QID whose enwiki article
 * title equals the concept label (batched 50-per-request, 宁缺勿错: redirects and fuzzy hits
 * simply miss) and merge zh/en aliases + qid into escoDataset.json in place. Resumable via
 * an on-disk cache. Usage: node scripts/canonical/enrich-esco-wikidata.mjs [min_occupations]
 */
import { readFileSync, writeFileSync } from "node:fs";

const MIN_OCCUPATIONS = Number(process.argv[2] ?? "10");
const MAX_ALIASES_PER_CONCEPT = 12;
const BATCH_SIZE = 50;
const datasetPath = new URL(
  "../../apps/desktop/src/data/generated/escoDataset.json",
  import.meta.url,
);
const cachePath = new URL("./out/esco-wikidata-cache.json", import.meta.url);

function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

async function wikidata(params) {
  const query = new URLSearchParams({ format: "json", ...params }).toString();
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`https://www.wikidata.org/w/api.php?${query}`, {
      headers: { "user-agent": "breadcrumb-canonical-pipeline (educational app; contact: dev)" },
    });
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after")) || attempt * 8;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`wikidata HTTP ${response.status}`);
    return response.json();
  }
  throw new Error("wikidata rate limit persisted");
}

function aliasesOf(entity, ownKey) {
  const texts = [];
  for (const lang of Object.values(entity.labels ?? {})) texts.push(lang.value);
  for (const list of Object.values(entity.aliases ?? {})) {
    for (const alias of list) texts.push(alias.value);
  }
  return [...new Set(texts)].filter((alias) => normalize(alias) !== ownKey);
}

const dataset = JSON.parse(readFileSync(datasetPath, "utf8"));
let cache = {};
try {
  cache = JSON.parse(readFileSync(cachePath, "utf8"));
} catch {
  cache = {};
}

const usage = new Map();
const bump = (id) => usage.set(id, (usage.get(id) ?? 0) + 1);
for (const occupation of Object.values(dataset.occupations)) {
  for (const ref of [...occupation.essential, ...occupation.optional]) {
    bump(ref.id);
    for (const child of ref.children ?? []) bump(child);
  }
}
const targets = [...usage.entries()]
  .filter(([, count]) => count >= MIN_OCCUPATIONS)
  .map(([id]) => id)
  .filter((id) => dataset.concepts[id] !== undefined);
const uncached = targets.filter(
  (id) => !Object.hasOwn(cache, normalize(dataset.concepts[id].label)),
);
console.log(`targets=${targets.length} uncached=${uncached.length} (>=${MIN_OCCUPATIONS} occ)`);

/** MediaWiki article titles capitalize the first letter; do it ourselves — the API's
 * normalize=1 is rejected for multi-title requests (params-illegal). */
function titleOf(label) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Batched enwiki-title resolution: one request covers 50 concepts; a title that is a
// redirect or missing article simply yields no QID (宁缺勿错).
for (let start = 0; start < uncached.length; start += BATCH_SIZE) {
  const batch = uncached
    .slice(start, start + BATCH_SIZE)
    .filter((id) => !dataset.concepts[id].label.includes("|"));
  const byTitle = new Map(batch.map((id) => [titleOf(dataset.concepts[id].label), id]));
  try {
    const data = await wikidata({
      action: "wbgetentities",
      sites: "enwiki",
      titles: [...byTitle.keys()].join("|"),
      props: "labels|aliases|sitelinks",
      languages: "zh|zh-hans|zh-cn|en",
    });
    if (data.error !== undefined) throw new Error(data.error.info ?? data.error.code);
    const resolved = new Set();
    for (const [qid, entity] of Object.entries(data.entities ?? {})) {
      if (qid.startsWith("-") || entity.missing !== undefined) continue;
      const id = byTitle.get(entity.sitelinks?.enwiki?.title ?? "");
      if (id === undefined) continue;
      const key = normalize(dataset.concepts[id].label);
      cache[key] = { qid, aliases: aliasesOf(entity, key) };
      resolved.add(id);
    }
    for (const id of batch) {
      const key = normalize(dataset.concepts[id].label);
      if (!resolved.has(id) && !Object.hasOwn(cache, key)) cache[key] = { qid: null, aliases: [] };
    }
    writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.warn(`batch at ${start} failed: ${error.message}`);
  }
  console.log(`progress ${Math.min(start + BATCH_SIZE, uncached.length)}/${uncached.length}`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

let hits = 0;
for (const id of targets) {
  const concept = dataset.concepts[id];
  const cached = cache[normalize(concept.label)];
  if (!cached?.qid) continue;
  hits += 1;
  concept.qid = cached.qid;
  concept.aliases = [...new Set([...concept.aliases, ...cached.aliases])]
    .filter((alias) => alias.length > 0 && alias.length <= 60)
    .slice(0, MAX_ALIASES_PER_CONCEPT);
}
writeFileSync(datasetPath, JSON.stringify(dataset));
console.log(`done: enriched=${hits}/${targets.length} bytes=${JSON.stringify(dataset).length}`);
