/**
 * Purpose: dev-time internalization of the O*NET database subset (spec 026, CC BY 4.0) — no
 * LLM anywhere: official structured rows are copied verbatim into a compact bundled JSON
 * (occupation directory with alternate titles, core task statements, technology skills,
 * high-importance knowledge/skills descriptors) so every occupation profile builds offline.
 * Usage: node scripts/canonical/extract-onet.mjs <db_text_dir>
 * Side effects: writes apps/desktop/src/data/generated/onetDataset.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , dir] = process.argv;
if (!dir) {
  console.error("usage: node extract-onet.mjs <db_text_dir>");
  process.exit(1);
}

function rows(file) {
  const lines = readFileSync(join(dir, file), "utf8")
    .replace(/\r/g, "")
    .split("\n")
    .filter(Boolean);
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

/** Column presence assertions — parsing drift must fail loudly, never mis-slot silently. */
function assertColumns(file, sample, expected) {
  for (const column of expected) {
    if (!(column in sample)) throw new Error(`${file}: missing column ${column}`);
  }
}

const IMPORTANCE_FLOOR = 3.0;
const MAX_ALT_TITLES = 20;
const MAX_TECH_PER_OCCUPATION = 40;

const occupationRows = rows("Occupation Data.txt");
assertColumns("Occupation Data", occupationRows[0], ["O*NET-SOC Code", "Title", "Description"]);
const altRows = rows("Alternate Titles.txt");
assertColumns("Alternate Titles", altRows[0], ["O*NET-SOC Code", "Alternate Title"]);
const taskRows = rows("Task Statements.txt");
assertColumns("Task Statements", taskRows[0], ["O*NET-SOC Code", "Task ID", "Task", "Task Type"]);
const techRows = rows("Technology Skills.txt");
assertColumns("Technology Skills", techRows[0], ["O*NET-SOC Code", "Example", "Hot Technology"]);
const knowledgeRows = rows("Knowledge.txt");
assertColumns("Knowledge", knowledgeRows[0], [
  "O*NET-SOC Code",
  "Element Name",
  "Scale ID",
  "Data Value",
  "Recommend Suppress",
]);
const skillRows = rows("Skills.txt");
assertColumns("Skills", skillRows[0], [
  "O*NET-SOC Code",
  "Element Name",
  "Scale ID",
  "Data Value",
  "Recommend Suppress",
]);

const altByCode = new Map();
for (const row of altRows) {
  const code = row["O*NET-SOC Code"];
  const title = row["Alternate Title"];
  if (title.length === 0 || title.length > 40) continue;
  const list = altByCode.get(code) ?? [];
  if (list.length < MAX_ALT_TITLES) list.push(title);
  altByCode.set(code, list);
}

const tasksByCode = new Map();
for (const row of taskRows) {
  const code = row["O*NET-SOC Code"];
  const list = tasksByCode.get(code) ?? [];
  list.push({ id: row["Task ID"], text: row.Task, core: row["Task Type"] === "Core" });
  tasksByCode.set(code, list);
}

const techByCode = new Map();
for (const row of techRows) {
  const code = row["O*NET-SOC Code"];
  const list = techByCode.get(code) ?? [];
  list.push({ name: row.Example, hot: row["Hot Technology"] === "Y" });
  techByCode.set(code, list);
}

function descriptorMap(sourceRows) {
  const byCode = new Map();
  for (const row of sourceRows) {
    if (row["Scale ID"] !== "IM" || row["Recommend Suppress"] === "Y") continue;
    const importance = Number(row["Data Value"]);
    if (!(importance >= IMPORTANCE_FLOOR)) continue;
    const code = row["O*NET-SOC Code"];
    const list = byCode.get(code) ?? [];
    list.push({ name: row["Element Name"], importance });
    byCode.set(code, list);
  }
  for (const list of byCode.values()) list.sort((a, b) => b.importance - a.importance);
  return byCode;
}
const knowledgeByCode = descriptorMap(knowledgeRows);
const skillsByCode = descriptorMap(skillRows);

const occupations = occupationRows.map((row) => {
  const code = row["O*NET-SOC Code"];
  const tech = (techByCode.get(code) ?? []).slice(0, MAX_TECH_PER_OCCUPATION);
  return {
    code,
    title: row.Title,
    description: row.Description,
    alt: altByCode.get(code) ?? [],
    tasks: tasksByCode.get(code) ?? [],
    tech,
    knowledge: knowledgeByCode.get(code) ?? [],
    skills: skillsByCode.get(code) ?? [],
  };
});

const dataset = {
  source: "O*NET 30.2 Database (CC BY 4.0, U.S. Department of Labor)",
  occupations,
};
const outPath = new URL("../../apps/desktop/src/data/generated/onetDataset.json", import.meta.url);
const json = JSON.stringify(dataset);
writeFileSync(outPath, json);
console.log(`occupations=${occupations.length} tasks=${taskRows.length} bytes=${json.length}`);
