/**
 * Purpose: dev-time internalization of ESCO-derived occupation knowledge (spec 027, CC BY
 * 4.0) — no LLM: official crosswalk picks ESCO occupations per O*NET code (exact > narrow >
 * broad > close, union within the winning tier), their essential/optional skills become the
 * fine-grained knowledge branch, broad concepts expand one narrower level.
 * Usage: node extract-esco.mjs <esco_csv_dir> <crosswalk_csv> <onet_dataset_json>
 * Side effects: writes apps/desktop/src/data/generated/escoDataset.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , escoDir, crosswalkPath, onetDatasetPath] = process.argv;
if (!escoDir || !crosswalkPath || !onetDatasetPath) {
  console.error("usage: node extract-esco.mjs <esco_csv_dir> <crosswalk_csv> <onet_dataset_json>");
  process.exit(1);
}

/** Minimal RFC 4180 parser — ESCO cells hold quoted embedded newlines (altLabels). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

function readCsvObjects(path) {
  const rows = parseCsv(readFileSync(path, "utf8").replace(/^﻿/, ""));
  const headers = rows[0];
  return rows
    .slice(1)
    .map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));
}

function assertColumns(name, sample, expected) {
  for (const column of expected) {
    if (!(column in sample)) throw new Error(`${name}: missing column ${column}`);
  }
}

const MATCH_TIERS = ["exactMatch", "narrowMatch", "broadMatch", "closeMatch"];
const MAX_OPTIONAL_PER_OCCUPATION = 80;
const MAX_CHILDREN_PER_CONCEPT = 40;
const MAX_ALIASES_PER_CONCEPT = 6;

// Crosswalk has a metadata preamble; the real header starts at the "O*NET Id" row.
const crosswalkRows = parseCsv(readFileSync(crosswalkPath, "utf8").replace(/^﻿/, ""));
const headerIndex = crosswalkRows.findIndex((cells) => cells[0] === "O*NET Id");
if (headerIndex < 0) throw new Error("crosswalk: header row 'O*NET Id' not found");
const crosswalkByCode = new Map();
for (const cells of crosswalkRows.slice(headerIndex + 1)) {
  const [code, , , escoUri, escoTitle, , matchType] = cells;
  if (!code || !MATCH_TIERS.includes(matchType)) continue; // drops exactISCO (group, no skills)
  const list = crosswalkByCode.get(code) ?? [];
  list.push({ escoUri, escoTitle, matchType });
  crosswalkByCode.set(code, list);
}

const skillRows = readCsvObjects(join(escoDir, "skills_en.csv"));
assertColumns("skills", skillRows[0], ["conceptUri", "skillType", "preferredLabel", "altLabels"]);
const skillByUri = new Map();
for (const row of skillRows) {
  skillByUri.set(row.conceptUri, {
    label: row.preferredLabel,
    type: row.skillType === "knowledge" ? "knowledge" : "skill",
    aliases: row.altLabels.split("\n").filter(Boolean).slice(0, MAX_ALIASES_PER_CONCEPT),
  });
}

const relationRows = readCsvObjects(join(escoDir, "occupationSkillRelations_en.csv"));
assertColumns("occupationSkillRelations", relationRows[0], [
  "occupationUri",
  "relationType",
  "skillUri",
]);
const relationsByOccupation = new Map();
for (const row of relationRows) {
  const list = relationsByOccupation.get(row.occupationUri) ?? [];
  list.push({ skillUri: row.skillUri, relationType: row.relationType });
  relationsByOccupation.set(row.occupationUri, list);
}

const broaderRows = readCsvObjects(join(escoDir, "broaderRelationsSkillPillar_en.csv"));
assertColumns("broaderRelationsSkillPillar", broaderRows[0], [
  "conceptType",
  "conceptUri",
  "broaderUri",
]);
const childrenByUri = new Map();
for (const row of broaderRows) {
  if (row.conceptType !== "KnowledgeSkillCompetence") continue;
  const list = childrenByUri.get(row.broaderUri) ?? [];
  list.push(row.conceptUri);
  childrenByUri.set(row.broaderUri, list);
}

const shortId = (uri) => uri.split("/").pop();
const onetCodes = JSON.parse(readFileSync(onetDatasetPath, "utf8")).occupations.map(
  (occupation) => occupation.code,
);

// Concepts are stored once in a shared dictionary; occupations hold id references only —
// the naive per-occupation embedding weighed 33MB, this shape ~3MB.
let uncovered = 0;
let droppedOptional = 0;
let droppedChildren = 0;
const concepts = {};
const registerConcept = (uri) => {
  const skill = skillByUri.get(uri);
  if (skill === undefined) return null;
  const id = shortId(uri);
  if (!(id in concepts)) {
    concepts[id] = { label: skill.label, type: skill.type, aliases: skill.aliases };
  }
  return id;
};
const occupations = {};
for (const code of onetCodes) {
  const mappings = crosswalkByCode.get(code);
  if (mappings === undefined) {
    uncovered += 1;
    continue;
  }
  const tier = MATCH_TIERS.find((type) => mappings.some((m) => m.matchType === type));
  const chosen = mappings.filter((m) => m.matchType === tier);
  const byUri = new Map();
  for (const mapping of chosen) {
    for (const relation of relationsByOccupation.get(mapping.escoUri) ?? []) {
      if (!skillByUri.has(relation.skillUri)) continue;
      const essential =
        relation.relationType === "essential" || byUri.get(relation.skillUri) === true;
      byUri.set(relation.skillUri, essential);
    }
  }
  const direct = new Set(byUri.keys());
  const toRef = (uri) => {
    const id = registerConcept(uri);
    if (id === null) return null;
    const childUris = (childrenByUri.get(uri) ?? []).filter((child) => !direct.has(child));
    droppedChildren += Math.max(0, childUris.length - MAX_CHILDREN_PER_CONCEPT);
    const children = childUris
      .slice(0, MAX_CHILDREN_PER_CONCEPT)
      .map(registerConcept)
      .filter((child) => child !== null);
    return children.length > 0 ? { id, children } : { id };
  };
  const essentialUris = [...byUri.entries()].filter(([, ess]) => ess).map(([uri]) => uri);
  const optionalUris = [...byUri.entries()].filter(([, ess]) => !ess).map(([uri]) => uri);
  droppedOptional += Math.max(0, optionalUris.length - MAX_OPTIONAL_PER_OCCUPATION);
  occupations[code] = {
    via: chosen.map((m) => ({ title: m.escoTitle, matchType: m.matchType })),
    essential: essentialUris.map(toRef).filter(Boolean),
    optional: optionalUris.slice(0, MAX_OPTIONAL_PER_OCCUPATION).map(toRef).filter(Boolean),
  };
}

const dataset = {
  source: "ESCO v1.2.1 (European Union, CC BY 4.0) via the official ESCO-O*NET crosswalk",
  concepts,
  occupations,
};
const outPath = new URL("../../apps/desktop/src/data/generated/escoDataset.json", import.meta.url);
const json = JSON.stringify(dataset);
writeFileSync(outPath, json);
console.log(
  `occupations=${Object.keys(occupations).length} uncovered=${uncovered} ` +
    `droppedOptional=${droppedOptional} droppedChildren=${droppedChildren} bytes=${json.length}`,
);
