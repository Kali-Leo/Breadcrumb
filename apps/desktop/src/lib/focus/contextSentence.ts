/**
 * Purpose: compatibility forwarder. The sentence-boundary lookup moved to
 * @breadcrumb/core-text (2026-09-02) — it is pure string arithmetic that knows nothing about
 * either feature that calls it. This file exists so the components importing it by path keep
 * working until they are pointed at the package directly; nothing new should import here.
 * Main exports: contextSentenceFor, wovenContextSentenceFor.
 */
export { contextSentenceFor, wovenContextSentenceFor } from "@breadcrumb/core-text";
