/**
 * Purpose: public entry of the companion-cast module (spec 037) — Character Card V2 subset
 * schema, the three authored cards, the safety module (manipulation gate, crisis detection,
 * break reminders, companion copy), the memory stream, the proactive-initiation gate, and the
 * teach-back knowledge state (script-first + Reflect-Respond).
 * Main exports: card schema/types/parsing, card loading, safety primitives, memory stream,
 * proactive gate, knowledge state.
 */
export * from "./cardSchema";
export * from "./cards/index";
export * from "./knowledgeState";
export * from "./memoryStream";
export * from "./safety";
