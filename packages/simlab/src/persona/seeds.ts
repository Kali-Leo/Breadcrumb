/**
 * Purpose: the seed persona set — each entry a named test scenario covering a
 * behavior extreme or a product-principle edge case; perturbPersona() generates reproducible
 * variants from these at run time instead of hand-writing every variant. The set is assembled
 * from per-script files because the script a persona writes in is itself a test axis.
 * Main exports: SEED_PERSONAS.
 */
import type { Persona } from "./schema";
import { CJK_SEED_PERSONAS } from "./seedsCjk";
import { INDIC_ARABIC_SEED_PERSONAS } from "./seedsIndicArabic";
import { LATIN_SCRIPT_SEED_PERSONAS } from "./seedsLatinScript";
import { ZH_SEED_PERSONAS } from "./seedsZh";

/** Chinese first, so `sim run` with no persona argument keeps picking the same three seeds it
 * always has and existing baselines stay comparable. */
export const SEED_PERSONAS: readonly Persona[] = [
  ...ZH_SEED_PERSONAS,
  ...LATIN_SCRIPT_SEED_PERSONAS,
  ...INDIC_ARABIC_SEED_PERSONAS,
  ...CJK_SEED_PERSONAS,
];
