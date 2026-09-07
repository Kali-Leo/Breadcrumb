/**
 * Purpose: the one number the matcher and its rules both have to agree on. Its own file so the
 * two cannot drift apart, and so the reasoning sits in one place.
 * Main exports: HIGH_FREQUENCY_BAND.
 */

/**
 * Where the extra-strict rule stops. Inside this band the source and target must be the same
 * part of speech and both must be content words; outside it, a shared dominant gloss is enough.
 *
 * 1000 because that is roughly where a frequency list stops being grammar and starts being
 * vocabulary: the top thousand of an OpenSubtitles list covers the large majority of running
 * text, so a wrong entry there is one the learner meets again and again rather than once, and
 * it is also where the pronouns, auxiliaries and irregular verb forms are concentrated. Below
 * it a wrong entry surfaces rarely and the recall of the looser rule is worth more.
 */
export const HIGH_FREQUENCY_BAND = 1000;
