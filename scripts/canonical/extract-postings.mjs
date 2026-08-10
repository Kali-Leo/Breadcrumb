/**
 * Purpose: dev-time timeliness-patch step 2 (spec 026 §4) — extract tool/skill mentions from
 * each real posting via DeepSeek with the verbatim double-check (label inside quote, quote
 * inside that posting's text), then aggregate across postings with a frequency floor so no
 * single posting's noise survives. Emits the bundled patch JSON keyed by SOC code.
 * Usage: node extract-postings.mjs <postings.json> <soc-code> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , postingsPath, socCode, outPath] = process.argv;
if (!postingsPath || !socCode || !outPath) {
  console.error("usage: node extract-postings.mjs <postings.json> <soc-code> <out.json>");
  process.exit(1);
}
const envText = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const apiKey = envText.match(/DEEPSEEK_API_KEY=(\S+)/)?.[1];
if (!apiKey) {
  console.error("DEEPSEEK_API_KEY missing");
  process.exit(1);
}

const MIN_POSTINGS = 3;

function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

const SYSTEM = `You are a verbatim requirement extractor. Given one real job posting, list the concrete technologies, tools and skills it explicitly requires or mentions, as JSON:
{"items":[{"label":"the technology/skill name (short, canonical casing, e.g. \\"React\\", \\"CI/CD\\")","quote":"the exact sentence fragment from the posting containing it, copied verbatim"}]}
Hard rules: label must be a contiguous substring of quote (case-insensitive); quote must be verbatim from the posting; extract specific nameable requirements only; when unsure, omit.`;

async function extract(posting) {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Job posting:\n${posting.title}\n${posting.description}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content).items ?? [];
}

const { postings } = JSON.parse(readFileSync(postingsPath, "utf8"));
const byLabel = new Map(); // normalized label -> {label, postings:Set<index>, sampleQuote}
let processed = 0;
for (const [index, posting] of postings.entries()) {
  try {
    const items = await extract(posting);
    const normalizedPosting = normalize(`${posting.title}\n${posting.description}`);
    for (const item of items) {
      const label = String(item.label ?? "").trim();
      const quote = String(item.quote ?? "").trim();
      if (label.length < 2 || label.length > 40) continue;
      if (!normalize(quote).includes(normalize(label))) continue;
      if (!normalizedPosting.includes(normalize(quote).slice(0, 30))) continue;
      const key = normalize(label);
      const entry = byLabel.get(key) ?? { label, postingSet: new Set(), sampleQuote: quote };
      entry.postingSet.add(index);
      byLabel.set(key, entry);
    }
    processed += 1;
  } catch (error) {
    console.warn(`posting ${index} skipped: ${error.message}`);
  }
}

const fetchedAt = new Date().toISOString();
const patch = [...byLabel.values()]
  .filter((entry) => entry.postingSet.size >= MIN_POSTINGS)
  .sort((a, b) => b.postingSet.size - a.postingSet.size)
  .slice(0, 40)
  .map((entry) => ({
    label: entry.label,
    postings: entry.postingSet.size,
    sampleQuote: entry.sampleQuote.slice(0, 120),
    fetchedAt,
  }));

let existing = {};
try {
  existing = JSON.parse(readFileSync(outPath, "utf8"));
} catch {
  existing = {};
}
existing[socCode] = patch;
writeFileSync(outPath, `${JSON.stringify(existing, null, 1)}\n`);
console.log(`processed=${processed}/${postings.length} patch=${patch.length}`);
