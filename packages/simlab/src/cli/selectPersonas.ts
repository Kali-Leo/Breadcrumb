/**
 * Purpose: picks `count` personas for a run by cycling through the seed personas, using
 * perturbPersona to generate a reproducible variant once a second lap around the seed list
 * starts, so a run can request more sessions than there are seeds without repeating an
 * identical persona.
 * Main exports: selectPersonas.
 */
import { perturbPersona } from "../persona/perturb";
import type { Persona } from "../persona/schema";
import { SEED_PERSONAS } from "../persona/seeds";

export function selectPersonas(count: number): Persona[] {
  const personas: Persona[] = [];
  for (let index = 0; index < count; index += 1) {
    const seed = SEED_PERSONAS[index % SEED_PERSONAS.length] as Persona;
    const lap = Math.floor(index / SEED_PERSONAS.length);
    personas.push(lap === 0 ? seed : perturbPersona(seed, lap));
  }
  return personas;
}
