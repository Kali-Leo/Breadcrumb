/**
 * Purpose: loads the three authored companion cards (spec 037 cast — Shichimi/Pepper/Cumin)
 * from bundled JSON, validating each through the Character Card V2 schema at load time.
 * Main export: loadCompanionCards.
 */

import type { CompanionCard } from "../cardSchema";
import { parseCompanionCard } from "../cardSchema";
import cuminJson from "./cumin.json";
import pepperJson from "./pepper.json";
import shichimiJson from "./shichimi.json";

/** Parses and validates the repository's three bundled companion cards, in cast order
 * (student, peer, mentor). Never loads community-authored cards. */
export function loadCompanionCards(): CompanionCard[] {
  return [shichimiJson, pepperJson, cuminJson].map((raw) => parseCompanionCard(raw));
}
