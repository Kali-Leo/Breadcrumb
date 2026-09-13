/**
 * Purpose: the one number that separates "this will take a few minutes" from "this will take
 * most of an hour", kept here so the desktop source and the browser edition's Worker can both
 * name it without either importing the other.
 * Main exports: SLOW_MS_PER_TEXT.
 */

/**
 * Milliseconds per passage, measured. Two hundred means a 40,000-character book takes about
 * half an hour, which is long enough that saying nothing would be the rude option; below it the
 * wait is minutes and the advice would be noise.
 */
export const SLOW_MS_PER_TEXT = 200;
