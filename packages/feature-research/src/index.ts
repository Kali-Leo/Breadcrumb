/**
 * Purpose: public entry of the research-task module (spec 036). Groundwork for future
 * institutional partnerships: an institution would be the one issuing a task, the task runs
 * on the user's own machine, the user can inspect every result, and the user alone decides
 * whether to send any of it to the institution — a channel that does not exist yet, not one
 * line of it.
 * Main exports: task schema/signature contract, executor, whitelisted statistics, UI copy.
 */
export * from "./canonicalJson";
export * from "./executor";
export * from "./statistics";
export * from "./statResults";
export * from "./taskSchema";
export * from "./taskSignature";
