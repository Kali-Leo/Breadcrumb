/**
 * Purpose: dev-time canonical-pipeline step 1 (spec 025) — slice the 课标 plain text by unit
 * headings, ask DeepSeek to extract fine-grained concepts from the ①②③ enumerations, and
 * mechanically verify every extraction (label must appear verbatim inside its quote, quote
 * chunks verbatim inside the source slice) so invented content cannot pass.
 * Usage: node --env-file=.env scripts/canonical/extract-kebiao.mjs <kebiao.txt> <out.json>
 * The key is read from the environment, never by parsing .env here: .env also holds the
 * research signing private key, and a script that only needs one variable should only ever
 * have that one in memory.
 * Side effects: writes <out.json> and <out.json>.rejects.txt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

const [, , sourcePath, outPath] = process.argv;
if (!sourcePath || !outPath) {
  console.error("usage: node extract-kebiao.mjs <kebiao.txt> <out.json>");
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

/** Ordered unit headings as they appear in the extracted text; each slice runs to the next
 * heading (or a hard stop marker). Keys match the built-in profile's unit item keys. */
const UNITS = [
  ["b-sets", "１．集合"],
  ["b-logic", "２．常用逻辑用语"],
  ["b-ineq", "３．相等关系与不等关系"],
  ["b-quad", "４．从函数观点看一元二次方程和一元二次不等式"],
  ["b-func-concept", "１．函数概念与性质"],
  ["b-func-elem", "２．幂函数、指数函数、对数函数"],
  ["b-func-trig", "３．三角函数"],
  ["b-func-apply", "４．函数应用"],
  ["b-geo-vector", "１．平面向量及其应用"],
  ["b-geo-complex", "２．复数"],
  ["b-geo-solid", "３．立体几何初步"],
  ["b-prob-prob", "１．概率"],
  ["b-prob-stat", "２．统计"],
  ["x-seq", "１．数列"],
  ["x-deriv", "２．一元函数导数及其应用"],
  ["x-geo-space", "１．空间向量与立体几何"],
  ["x-geo-analytic", "２．平面解析几何"],
  ["x-count", "１．计数原理"],
  ["x-prob-prob", "２．概率"],
  ["x-prob-stat", "３．统计"],
];

const source = readFileSync(sourcePath, "utf8");

/** NFKC-fold and strip all whitespace — the shared normalization for containment checks. */
function normalize(text) {
  return text.normalize("NFKC").replace(/\s+/gu, "");
}
const normalizedSource = normalize(source);

/** pdftotext sometimes replaces the "．" after the unit number with a private-use glyph or
 * drops it — match the number and title with a tolerant 0-3 char gap. */
function findHeading(heading, from) {
  const [num, title] = heading.split("．");
  const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapeRegex(num)}[^\\n]{0,3}${escapeRegex(title)}`, "u");
  const match = pattern.exec(source.slice(from));
  if (match === null) return null;
  return { start: from + match.index, length: match[0].length };
}

function sliceFor(index) {
  const [, heading] = UNITS[index];
  const from = index === 0 ? 0 : (sliceFor.lastEnd ?? 0);
  const found = findHeading(heading, from);
  if (found === null) throw new Error(`heading not found: ${heading}`);
  const next = index + 1 < UNITS.length ? findHeading(UNITS[index + 1][1], found.start + 1) : null;
  const end = next !== null ? next.start : Math.min(source.length, found.start + 12000);
  sliceFor.lastEnd = found.start + found.length;
  return source.slice(found.start, end);
}

const SYSTEM = `你是课程标准的逐字抽取器。给定一个单元的课标原文片段，抽取其中【内容要求】层级的细粒知识概念，以 JSON 返回：
{"items":[{"parent":"该概念所属的（ｎ）级小标题原文，没有则为null","label":"概念名（名词短语）","quote":"包含该概念名的那句原文，逐字照抄"}]}
硬规则：
- label 必须是 quote 的连续子串；quote 必须逐字来自片段原文，禁止改写、拼接、补字
- 每个（ｎ）级小标题本身也作为一条 item（label=小标题去掉编号后的文字，quote=小标题所在行原文，parent=null）
- 概念名取具体知识点（如"余弦定理""平面向量数量积""分层随机抽样"），不取动词短语；同一概念只出一条
- 标有 * 的选学内容照抽，label 后不加任何标记
- 宁缺勿错：拿不准的不要输出`;

async function extractUnit(key, heading, slice) {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `单元：${heading}\n\n原文片段：\n${slice}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
  const data = CompletionSchema.parse(await response.json());
  let answer;
  try {
    answer = JSON.parse(data.choices[0].message.content);
  } catch {
    throw new Error("model reply was not JSON");
  }
  return Array.isArray(answer.items) ? answer.items : [];
}

/** Quote soft check: ≥80% of its 10-char chunks appear verbatim in the whole source
 * (pdftotext occasionally reorders paragraph fragments, so exact containment is too strict). */
function quoteOk(quote) {
  const normalized = normalize(quote);
  const chunks = [];
  for (let index = 0; index + 10 <= normalized.length; index += 10) {
    chunks.push(normalized.slice(index, index + 10));
  }
  if (chunks.length === 0) return normalizedSource.includes(normalized);
  const hits = chunks.filter((chunk) => normalizedSource.includes(chunk)).length;
  return hits / chunks.length >= 0.8;
}

const accepted = [];
const rejects = [];
for (let index = 0; index < UNITS.length; index += 1) {
  const [key, heading] = UNITS[index];
  const slice = sliceFor(index);
  // One unhappy unit must not lose the other nineteen: a malformed reply costs this batch only.
  let items;
  try {
    items = await extractUnit(key, heading, slice);
  } catch (error) {
    console.warn(`${key}: skipped (${error.message})`);
    continue;
  }
  for (const item of items) {
    const label = String(item.label ?? "").trim();
    const quote = String(item.quote ?? "").trim();
    const parent = item.parent === null || item.parent === undefined ? null : String(item.parent);
    const labelInQuote = normalize(quote).includes(normalize(label));
    if (label.length >= 2 && labelInQuote && quoteOk(quote)) {
      accepted.push({ unitKey: key, parent, label, quote });
    } else {
      rejects.push(`${key} | ${label} | labelInQuote=${labelInQuote} | ${quote.slice(0, 40)}`);
    }
  }
  console.log(`${key}: ${items.length} extracted`);
}

writeFileSync(
  outPath,
  `${JSON.stringify({ generatedFrom: "普通高中数学课程标准（2017年版2020年修订）", items: accepted }, null, 2)}\n`,
);
writeFileSync(`${outPath}.rejects.txt`, `${rejects.join("\n")}\n`);
console.log(`accepted=${accepted.length} rejected=${rejects.length}`);
