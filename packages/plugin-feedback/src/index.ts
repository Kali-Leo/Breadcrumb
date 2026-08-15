/**
 * Purpose: public entry of the feedback plugin (headless logic only — the UI graduated
 * into the memory palace's context stack, spec 046). trends/wordSettledSeries stay
 * exported without a UI consumer: the trends surface was held back pending a copy rework.
 * Main exports: everything from activity, smallWins, totals, reunion, settled, evidence,
 * trends, wordSettledSeries and uiCopy.
 */
export * from "./activity";
export * from "./evidence";
export * from "./reunion";
export * from "./settled";
export * from "./smallWins";
export * from "./totals";
export * from "./trends";
export * from "./uiCopy";
export * from "./wordSettledSeries";
