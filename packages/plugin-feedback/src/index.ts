/**
 * Purpose: public entry of the feedback-lab plugin (headless logic only — UI lives in the
 * desktop app's FeedbackPanel, spec 035).
 * Main exports: everything from activity, smallWins, totals, reunion, dailyBite,
 * systemGauge, settled, evidence, trends, wordSettledSeries and uiCopy.
 */
export * from "./activity";
export * from "./dailyBite";
export * from "./evidence";
export * from "./reunion";
export * from "./settled";
export * from "./smallWins";
export * from "./systemGauge";
export * from "./totals";
export * from "./trends";
export * from "./uiCopy";
export * from "./wordSettledSeries";
