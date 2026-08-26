/**
 * Purpose: Zod schemas for every response of the local browsing-interest service
 * (interest-model/daemon, 127.0.0.1:21456). The service is a separate project we only read
 * from, so its JSON is external input and is parsed, never asserted.
 * Main exports: the five response schemas and their inferred types.
 */
import { z } from "zod";

/** The service stores titles/authors straight from the pages, where either can be missing. */
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

export const browsingProfileSchema = z.object({
  topics: z.array(z.string()),
  groups: z.record(z.string(), z.array(z.string())),
  short: z.array(z.number()),
  long: z.array(z.number()),
  expose: z.array(z.number()),
  prefs: z.record(z.string(), z.number()),
  drivers: z.record(z.string(), z.array(z.object({ title: text, up: text }))),
  n_events: z.number(),
  classifier: z.string(),
  emotion_on: z.boolean(),
});
export type BrowsingProfile = z.infer<typeof browsingProfileSchema>;

const emotionPointSchema = z.object({
  day: z.number(),
  valence: z.number(),
  n: z.number(),
  mix: z.array(z.number()),
});
export type EmotionPoint = z.infer<typeof emotionPointSchema>;

export const emotionSeriesSchema = z.object({
  emotions: z.array(z.string()),
  valences: z.array(z.number()),
  expose: z.array(emotionPointSchema),
  engage: z.array(emotionPointSchema),
});
export type EmotionSeries = z.infer<typeof emotionSeriesSchema>;

export const wordCloudSchema = z.object({
  days: z.number(),
  source: z.string(),
  words: z.array(z.object({ w: z.string(), n: z.number(), valence: z.number() })),
});
export type WordCloud = z.infer<typeof wordCloudSchema>;
export type CloudWord = WordCloud["words"][number];

export const newInterestsSchema = z.object({
  interests: z.array(
    z.object({
      topic: z.string(),
      share: z.number(),
      before: z.number(),
      items: z.array(z.object({ title: text, up: text, id: text, site: text })),
    }),
  ),
});
export type NewInterests = z.infer<typeof newInterestsSchema>;

const proItemSchema = z.object({
  ts: z.number(),
  id: text,
  title: text,
  up: text,
  topic: z.string(),
  group: z.string(),
  pic: text,
  dwell: z.number(),
  dur: z.number(),
  site: text,
});
export type ProContentItem = z.infer<typeof proItemSchema>;

export const proContentSchema = z.object({
  days: z.number(),
  finished: z.array(proItemSchema),
  unfinished: z.array(proItemSchema),
});
export type ProContent = z.infer<typeof proContentSchema>;
