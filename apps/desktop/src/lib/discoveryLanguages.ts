/**
 * Purpose: the languages the discovery feed can be set to (spec 054, Leo's second point) — the two
 * the shipped catalog actually publishes in, what each is called in its own writing, which one a
 * fresh install starts on, and how the reader's stored answer becomes the set the filter reads.
 * Kept apart from the filter itself so the first-run panel and the settings section can share the
 * vocabulary without pulling in the pool.
 * Main exports: FeedLanguage, feedLanguageSchema, FEED_LANGUAGE_CHOICES, defaultFeedLanguage,
 * resolveFeedLanguagePolicy, FeedLanguagePolicy.
 */
import { z } from "zod";

/** The catalog publishes 21 Chinese sources, 21 English ones and one that belongs to no language,
 * so these two are what a reader can be offered without being offered an empty feed. */
export const feedLanguageSchema = z.enum(["zh", "en"]);

export type FeedLanguage = z.infer<typeof feedLanguageSchema>;

export interface FeedLanguageChoice {
  readonly language: FeedLanguage;
  /** A language is named in its own writing everywhere this is done well — a reader who cannot
   * read the current one still has to find theirs. */
  readonly label: string;
}

export const FEED_LANGUAGE_CHOICES: readonly FeedLanguageChoice[] = [
  { language: "zh", label: "中文" },
  { language: "en", label: "English" },
];

export function feedLanguageLabel(language: FeedLanguage): string {
  return FEED_LANGUAGE_CHOICES.find((choice) => choice.language === language)?.label ?? "中文";
}

/**
 * Where the first-run panel starts. The app speaks Chinese, so Chinese is the answer unless the
 * machine itself says otherwise — an English-language system is the one case where starting on
 * Chinese would be starting on the wrong one.
 */
export function defaultFeedLanguage(): FeedLanguage {
  const systemLanguage =
    typeof navigator === "undefined" ? "" : (navigator.language ?? "").toLowerCase();
  return systemLanguage.startsWith("en") ? "en" : "zh";
}

/** What the reader's settings say about language, in the shape both filters read. */
export interface FeedLanguagePolicy {
  /** Every language the feed may show. The one chosen at first run is always in it; the language
   * settings can add the others. */
  readonly enabledLanguages: readonly FeedLanguage[];
  /**
   * Spec 054, Leo's seventh point (「添加"学术内容"开关并豁免英语」). Papers never pass through the
   * language check at all — an English paper reaches a Chinese reader — so what is left for a
   * switch to decide is whether papers come through in the first place. The follow-up task turns
   * this into a real setting; until then it is on, which is what the feed has always done.
   */
  readonly academicContentEnabled: boolean;
  /**
   * Channels the reader went into the source settings and switched on by hand. Their requests are
   * made and their cards are shown whatever language they turn out to be in: a switch that does
   * nothing is worse than a stray card, and both filters have to agree about it or the channel is
   * polled and then thrown away.
   */
  readonly readerChosenSourceIds: readonly string[];
}

/** The stored half of the answer: null means the reader has not been asked yet. */
export interface StoredFeedLanguageSettings {
  readonly feedLanguage: FeedLanguage | null;
  readonly additionalFeedLanguages: readonly FeedLanguage[];
  /** The seam Leo's seventh point leaves for its own task: the academic-content switch will
   * write this, and nothing else about either filter has to change. Absent means on, which is
   * what the feed does today. */
  readonly academicContentEnabled?: boolean;
  /** The source settings' own record. Only the channels the reader actually switched are in it. */
  readonly channelEnabledById?: Readonly<Record<string, boolean>>;
}

/** Turns what is on disk into the policy the filters take, filling in the default for a reader
 * who has never answered and dropping a duplicate if the settings ever hold one. */
export function resolveFeedLanguagePolicy(
  settings: StoredFeedLanguageSettings,
): FeedLanguagePolicy {
  const primary = settings.feedLanguage ?? defaultFeedLanguage();
  const enabled = new Set<FeedLanguage>([primary, ...settings.additionalFeedLanguages]);
  const switches = settings.channelEnabledById ?? {};
  return {
    enabledLanguages: [...enabled],
    academicContentEnabled: settings.academicContentEnabled ?? true,
    readerChosenSourceIds: Object.keys(switches).filter((id) => switches[id] === true),
  };
}
