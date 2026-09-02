/**
 * Purpose: dev-time canonical-pipeline step 1b (spec 025) — fetch each MDN Curriculum module
 * page, extract learning-outcome-level fine concepts via DeepSeek, and mechanically verify
 * (label verbatim inside quote, quote chunks verbatim inside the page text) so invented
 * content cannot pass.
 * Usage: node --env-file=.env scripts/canonical/extract-mdn.mjs <out.json>
 * The key is read from the environment, never by parsing .env here: .env also holds the
 * research signing private key, and a script that only needs one variable should only ever
 * have that one in memory.
 * Side effects: network fetches to developer.mozilla.org; writes <out.json> and rejects file.
 */
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { normalize } from "./shared.mjs";

const [, , outPath] = process.argv;
if (!outPath) {
  console.error("usage: node extract-mdn.mjs <out.json>");
  process.exit(1);
}
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("DEEPSEEK_API_KEY missing — run with `node --env-file=.env`");
  process.exit(1);
}

/** The provider's envelope, not the model's answer: enough shape to index `choices[0]` without
 * guessing. The answer itself is checked the hard way below — every label and quote must appear
 * verbatim in the source, which no schema can express. */
const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const BASE = "https://developer.mozilla.org/en-US/curriculum/";
/** Module pages keyed by the built-in profile's item keys (JS fundamentals excluded — its 15
 * sections are already fine-grained items; their page-level outcomes would double-count). */
const MODULES = [
  ["core-standards", `${BASE}core/web-standards/`],
  ["core-html", `${BASE}core/semantic-html/`],
  ["core-css-fund", `${BASE}core/css-fundamentals/`],
  ["core-css-text", `${BASE}core/css-text-styling/`],
  ["core-css-layout", `${BASE}core/css-layout/`],
  ["core-a11y", `${BASE}core/accessibility/`],
  ["core-design", `${BASE}core/design-for-developers/`],
  ["core-vcs", `${BASE}core/version-control/`],
  ["ext-css-anim", `${BASE}extensions/transform-and-animate-css/`],
  ["ext-js-objects", `${BASE}extensions/custom-js-objects/`],
  ["ext-web-apis", `${BASE}extensions/web-apis/`],
  ["ext-perf", `${BASE}extensions/performance/`],
  ["ext-security", `${BASE}extensions/security-and-privacy/`],
  ["ext-testing", `${BASE}extensions/testing/`],
  ["ext-frameworks", `${BASE}extensions/a-practical-understanding-of-javascript-frameworks/`],
  ["ext-css-tooling", `${BASE}extensions/css-tooling/`],
  ["ext-other-tooling", `${BASE}extensions/other-tooling-types/`],
];

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

const SYSTEM = `You are a verbatim curriculum extractor. Given the plain text of one MDN Curriculum module page, extract its learning-outcome-level fine-grained concepts as JSON:
{"items":[{"label":"concept name (noun phrase, e.g. \\"Flexbox\\", \\"Event delegation\\")","quote":"the exact sentence/bullet from the page containing that name, copied verbatim"}]}
Hard rules:
- label must be a contiguous substring of quote; quote must be copied verbatim from the page text — no rewording, no stitching
- extract specific technologies/concepts (e.g. "CSS grid", "semantic HTML", "media queries"), not verbs or whole sentences; one entry per concept
- when unsure, omit — precision over recall`;

async function extractModule(key, url) {
  const page = await fetch(url, { headers: { "user-agent": "breadcrumb-canonical-pipeline" } });
  if (!page.ok) throw new Error(`${key}: HTTP ${page.status}`);
  const text = stripHtml(await page.text())
    .replace(/\s+/g, " ")
    .slice(0, 24000);
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Module page text:\n${text}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`${key}: LLM HTTP ${response.status}`);
  const data = CompletionSchema.parse(await response.json());
  let answer;
  try {
    answer = JSON.parse(data.choices[0].message.content);
  } catch {
    throw new Error("model reply was not JSON");
  }
  return { items: Array.isArray(answer.items) ? answer.items : [], text };
}

const accepted = [];
const rejects = [];
for (const [key, url] of MODULES) {
  try {
    const { items, text } = await extractModule(key, url);
    const normalizedPage = normalize(text);
    for (const item of items) {
      const label = String(item.label ?? "").trim();
      const quote = String(item.quote ?? "").trim();
      const ok =
        label.length >= 3 &&
        normalize(quote).includes(normalize(label)) &&
        normalizedPage.includes(normalize(quote).slice(0, 40));
      if (ok) {
        accepted.push({ unitKey: key, parent: null, label, quote, sourceUrl: url });
      } else {
        rejects.push(`${key} | ${label}`);
      }
    }
    console.log(`${key}: ${items.length} extracted`);
  } catch (error) {
    console.warn(`${key}: skipped (${error.message})`);
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

writeFileSync(
  outPath,
  `${JSON.stringify({ generatedFrom: "MDN Curriculum", items: accepted }, null, 2)}\n`,
);
writeFileSync(`${outPath}.rejects.txt`, `${rejects.join("\n")}\n`);
console.log(`accepted=${accepted.length} rejected=${rejects.length}`);
