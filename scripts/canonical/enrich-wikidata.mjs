/**
 * Purpose: dev-time canonical-pipeline step 2 (spec 025) — for every fine-grained concept
 * label, look up a Wikidata QID (accepted ONLY when the label equals the entity's label or
 * one of its aliases after normalization — 宁缺勿错) and collect zh/en aliases. Emits the
 * canonical concept list; labels without a confident QID get a stable slug id and no extra
 * aliases.
 *
 * An exact label match is not enough on its own: a name is shared across fields, and spec
 * 025's own walkthrough caught CSS "Functions" bound to Q190686, the mathematical function.
 * So the entity's description is read too, and a QID is refused when that description says
 * the entity is a person, a place, a work, an organism — or something from a field the
 * corpus being enriched is not about. Refusing costs a few aliases; accepting the wrong QID
 * teaches the app that two unrelated things are the same concept.
 *
 * Usage: node scripts/canonical/enrich-wikidata.mjs [--domain=web|math|occupation]
 *          <fine1.json> [fine2.json...] <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { descriptionDisqualifies } from "./wikidataGuard.mjs";

const rawArgs = process.argv.slice(2);
const domainArg = rawArgs.find((arg) => arg.startsWith("--domain="));
const domain = domainArg?.slice("--domain=".length) ?? "";
const args = rawArgs.filter((arg) => !arg.startsWith("--"));
if (args.length < 2) {
  console.error("usage: node enrich-wikidata.mjs <fine.json>... <out.json>");
  process.exit(1);
}
const outPath = args.pop();

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

/** A search hit counts only when the label exactly equals (normalized) the entity label or
 * one of its aliases in zh or en — near-misses are worse than no QID. */
async function findQid(label, language) {
  const search = await wikidata({
    action: "wbsearchentities",
    search: label,
    language,
    uselang: language,
    limit: "5",
    type: "item",
  });
  const target = normalize(label);
  for (const hit of search.search ?? []) {
    const texts = [hit.label ?? "", ...(hit.aliases ?? []), hit.match?.text ?? ""];
    if (texts.some((text) => normalize(text) === target)) return hit.id;
  }
  return null;
}

async function fetchEntity(qid) {
  const data = await wikidata({
    action: "wbgetentities",
    ids: qid,
    props: "labels|aliases|descriptions",
    languages: "zh|zh-hans|zh-cn|en",
  });
  const entity = data.entities?.[qid];
  if (!entity) return { aliases: [], description: "" };
  const texts = [];
  for (const lang of Object.values(entity.labels ?? {})) texts.push(lang.value);
  for (const list of Object.values(entity.aliases ?? {})) {
    for (const alias of list) texts.push(alias.value);
  }
  const descriptions = Object.values(entity.descriptions ?? {}).map((entry) => entry.value);
  return { aliases: [...new Set(texts)], description: descriptions.join(" · ") };
}

const cachePath = new URL("./out/wikidata-cache.json", import.meta.url);
let cache = {};
try {
  cache = JSON.parse(readFileSync(cachePath, "utf8"));
} catch {
  cache = {};
}
const { writeFileSync: writeCache } = await import("node:fs");
const seenLabels = new Map(); // normalized label -> concept
const concepts = [];
let qidCount = 0;
let rejectedByDescription = 0;

for (const inputPath of args) {
  const { items } = JSON.parse(readFileSync(inputPath, "utf8"));
  for (const item of items) {
    const key = normalize(item.label);
    if (seenLabels.has(key)) continue;
    const language = /\p{Script=Han}/u.test(item.label) ? "zh" : "en";
    let qid = null;
    let aliases = [];
    if (Object.hasOwn(cache, key)) {
      qid = cache[key].qid;
      aliases = cache[key].aliases;
      // Cached entries predate the description check; re-judge them from the cached text so
      // a rerun cleans up what an earlier run accepted.
      if (qid !== null && descriptionDisqualifies(cache[key].description ?? "", domain)) {
        rejectedByDescription += 1;
        qid = null;
        aliases = [];
      }
      if (qid !== null) qidCount += 1;
    } else {
      try {
        qid = await findQid(item.label, language);
        let description = "";
        if (qid !== null) {
          const entity = await fetchEntity(qid);
          description = entity.description;
          if (descriptionDisqualifies(description, domain)) {
            console.warn(`refused ${item.label} → ${qid}: ${description}`);
            rejectedByDescription += 1;
            qid = null;
          } else {
            aliases = entity.aliases.filter((alias) => normalize(alias) !== key);
            qidCount += 1;
          }
        }
        cache[key] = { qid, aliases, description };
        writeCache(cachePath, JSON.stringify(cache));
      } catch (error) {
        console.warn(`lookup failed for ${item.label}: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    const id = qid ?? `c:${key}`;
    const existing = concepts.find((concept) => concept.id === id);
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, item.label, ...aliases])];
      seenLabels.set(key, existing);
      continue;
    }
    const concept = {
      id,
      label: item.label,
      aliases,
      sourceRef:
        qid !== null
          ? `Wikidata ${qid}（标签/别名规范化全等匹配，检索核实于 2026-08-10）`
          : "无置信 QID——以清单来源为准",
    };
    concepts.push(concept);
    seenLabels.set(key, concept);
  }
}

writeFileSync(outPath, `${JSON.stringify({ concepts }, null, 2)}\n`);
console.log(
  `concepts=${concepts.length} withQid=${qidCount} refusedByDescription=${rejectedByDescription}`,
);
