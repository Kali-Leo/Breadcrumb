/**
 * Purpose: keeps zod off `new Function`. zod 4 probes for it once at start-up, which trips a
 * script-src / eval violation under both editions' CSP (seen in the 2026-09-02 browser
 * walkthrough); the probe is caught internally, so it was only noise — but noise that hides
 * a real violation. Imported once from App.tsx for its side effect.
 * Main exports: none (side effect only).
 */
import { z } from "zod";

z.config({ jitless: true });
