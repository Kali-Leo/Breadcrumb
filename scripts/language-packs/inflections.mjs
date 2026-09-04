/**
 * Purpose: reads one Kaikki entry for the fact that decides whether a surface is a dictionary
 * form — whether some other lemma conjugates or declines into it. Kaikki says so twice: with
 * `form_of` on a sense, and with the paradigm a lemma lists under `forms`. Both carry `tags`,
 * and the tags are what make this usable, because "is a form of something" on its own is far
 * too broad.
 *
 * Spanish `casa` is the third-person singular of `casar` AND the ordinary noun for "house";
 * Spanish `aspiradora` is merely the feminine of `aspirador` and is an ordinary noun for
 * "vacuum cleaner". Disqualifying both — which is what "has a form_of" does — throws away the
 * good half of the pack: `aspiradora → aspirateur` is one of the matches Leo checked and liked.
 * So only INFLECTION tags disqualify: person, tense, mood, participle, case, number. Gender and
 * derivation (feminine, diminutive) do not, because those forms are words in their own right.
 * Main exports: collectInflections.
 */

/**
 * Tags that mean "this is a grammatical form of another word, not a word". Verb morphology is
 * the dangerous half — French `est`/`été` and Spanish `son`/`era` are all finite verb forms
 * that happen to own a noun entry too, and every one of them was woven as its noun sense
 * (Leo's review, 2026-09-04). Case and number are here for the same reason in languages that
 * decline; gender is deliberately absent.
 */
const INFLECTION_TAGS = new Set([
  "first-person",
  "second-person",
  "third-person",
  "impersonal",
  "indicative",
  "subjunctive",
  "imperative",
  "conditional",
  "optative",
  "jussive",
  "present",
  "past",
  "future",
  "preterite",
  "imperfect",
  "perfect",
  "pluperfect",
  "aorist",
  "participle",
  "gerund",
  "infinitive",
  "supine",
  "converb",
  "transgressive",
  "plural",
  "dual",
  "comparative",
  "superlative",
  "nominative",
  "genitive",
  "dative",
  "accusative",
  "ablative",
  "locative",
  "instrumental",
  "vocative",
  "partitive",
  "essive",
  "illative",
  "elative",
  "adessive",
  "allative",
  "inessive",
  "construct",
  "oblique",
  "prolative",
  "translative",
  "abessive",
  "comitative",
]);

/** Gender, which is inflection for an adjective and a separate word for a noun — Spanish
 * `buena` is the feminine of `bueno` and also, obscurely, a noun meaning "inheritance", which
 * is how `buena → héritage` reached rank 203 of the es:fr pack. Recorded separately from the
 * tags above because the pair builder only refuses it high in the frequency list, where the
 * adjective reading is the one a learner will actually be looking at. */
const GENDER_TAGS = new Set(["feminine", "masculine", "neuter", "common-gender"]);

function hasTag(tags, set) {
  return Array.isArray(tags) && tags.some((tag) => set.has(tag));
}

function isInflection(tags) {
  return hasTag(tags, INFLECTION_TAGS);
}

/**
 * Records, for one raw entry:
 *  - into `sets.inflected`: `word` itself when a sense declares it an inflected form of
 *    something else, and every surface this entry lists as one of its own inflected forms;
 *  - into `sets.gendered`: gender forms, and ONLY from a sense that declares itself one. The
 *    paradigm tables are too loose for this: Spanish `padre`, `dios` and `señor` all turn up
 *    tagged "masculine" inside some other entry's table and are plainly not gender forms of
 *    anything, so reading the tables here cost `padre → père` and `dios → dieu`;
 *  - into `formsOf`: surface → this lemma, for the pack's surface→lemma fallback table, which
 *    wants the whole paradigm and not just the disqualifying part of it.
 */
export function collectInflections(raw, word, sets, formsOf) {
  for (const sense of raw.senses ?? []) {
    const formOf = sense.form_of;
    if (!Array.isArray(formOf) || formOf.length === 0) continue;
    if (isInflection(sense.tags)) sets.inflected.add(word);
    if (hasTag(sense.tags, GENDER_TAGS)) sets.gendered.add(word);
  }
  for (const form of raw.forms ?? []) {
    const surface = typeof form.form === "string" ? form.form.trim() : "";
    if (surface === "" || surface === word || surface.includes(" ")) continue;
    if (isInflection(form.tags)) sets.inflected.add(surface);
    if (formsOf[surface] === undefined) formsOf[surface] = word;
  }
}
