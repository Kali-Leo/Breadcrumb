/**
 * Purpose: the second gate on a Wikidata match (spec 025; backlog item "QID 描述域校验").
 * An exact label match is not enough — names are shared across fields, and the spec's own
 * walkthrough caught CSS "Functions" bound to Q190686, the mathematical function. This reads
 * the entity's description and refuses a match that describes a person, a place, a work, an
 * organism, or something from a field the corpus is not about.
 *
 * Refusing costs a few aliases. Accepting a wrong QID teaches the app that two unrelated
 * things are one concept, and every later merge and alignment inherits that mistake.
 *
 * Run `node scripts/canonical/wikidataGuard.mjs` to check the rules against their examples.
 * Main exports: descriptionDisqualifies, FIELD_MARKERS, NEVER_A_CONCEPT.
 */
import { pathToFileURL } from "node:url";

/** Descriptions that mean "not a concept anyone studies", whatever the corpus is. Both
 * languages, because Wikidata descriptions come in both. */
export const NEVER_A_CONCEPT = [
  "village",
  "commune in",
  "municipality",
  "human settlement",
  "city in",
  "town in",
  "surname",
  "given name",
  "family name",
  "footballer",
  "politician",
  "singer",
  "actor",
  "album",
  "song by",
  "film",
  "novel by",
  "genus of",
  "species of",
  "band from",
  "video game",
  "村庄",
  "乡镇",
  "行政区",
  "姓氏",
  "人名",
  "专辑",
  "歌曲",
  "电影",
  "小说",
  "运动员",
  "政治人物",
];

/** Fields whose vocabulary is a red flag in a corpus about something else. A corpus names its
 * own field; every other field's markers become its conflict list. */
export const FIELD_MARKERS = {
  web: ["computing", "software", "programming", "web", "computer", "计算机", "编程", "软件"],
  math: ["mathematic", "geometry", "algebra", "number theory", "数学", "几何", "代数"],
  occupation: ["occupation", "profession", "职业", "工种"],
  biology: ["organism", "protein", "gene", "anatomy", "生物", "蛋白", "基因", "解剖"],
  music: ["music", "musical", "音乐", "乐器"],
  geography: ["river", "mountain", "region of", "河流", "山脉", "地区"],
};

/**
 * Whether this description disqualifies the match. Conservative on both sides: an entity that
 * is a person/place/work/organism is never what we were looking for, and an entity described
 * in another field's vocabulary is refused — unless it also speaks the corpus's own field,
 * since plenty of real concepts belong to two at once ("graph" is maths and computing).
 * An unknown domain (or none given) only applies the first rule.
 */
export function descriptionDisqualifies(description, domain = "") {
  if (!description) return false;
  const text = description.toLowerCase();
  if (NEVER_A_CONCEPT.some((marker) => text.includes(marker))) return true;
  const own = FIELD_MARKERS[domain];
  if (own === undefined) return false;
  if (own.some((marker) => text.includes(marker))) return false;
  return Object.entries(FIELD_MARKERS).some(
    ([field, markers]) => field !== domain && markers.some((marker) => text.includes(marker)),
  );
}

const EXAMPLES = [
  // The case this gate exists for.
  ["mathematical function", "web", true],
  ["reusable block of code in a programming language", "web", false],
  // Belongs to both fields: accepted for either corpus.
  ["mathematical structure used in computer science", "web", false],
  ["mathematical structure used in computer science", "math", false],
  ["commune in France", "web", true],
  ["village in Iran", "math", true],
  ["Chinese given name", "occupation", true],
  ["style sheet language for describing the presentation of documents", "web", false],
  ["", "web", false],
  // No domain given: only the never-a-concept rule applies.
  ["mathematical function", "", false],
  ["village in Iran", "", true],
];

// pathToFileURL, not string concatenation: this repo lives under a non-ASCII path, where the
// two spellings of the same file differ by percent-encoding and the check silently never runs.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let failed = 0;
  for (const [description, domain, expected] of EXAMPLES) {
    const actual = descriptionDisqualifies(description, domain);
    if (actual !== expected) failed += 1;
    console.log(
      `${actual === expected ? "ok  " : "FAIL"} [${domain || "no domain"}] ${JSON.stringify(description)} -> ${actual}`,
    );
  }
  console.log(failed === 0 ? "all examples pass" : `${failed} example(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}
