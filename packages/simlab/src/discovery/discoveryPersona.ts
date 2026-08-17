/**
 * Purpose: the reader in the discovery journey — a few genuine interests, one topic they keep
 * turning away from, and everything else met with indifference. Decides, per card put in front
 * of them, which of the app's silent signals actually happen (open / dwell / finish / save /
 * 不感兴趣 / nothing). Deterministic under a seeded PRNG: same seed, same journey.
 * Main exports: DiscoveryPersona, CardReaction, reactToCard.
 */
import { mulberry32, seedFromStrings } from "../util/prng";

export interface DiscoveryPersona {
  name: string;
  /** Topic labels the reader genuinely reads. */
  interests: readonly string[];
  /** The one topic they keep saying 不感兴趣 to. */
  aversion: string;
  /** How much of a session they get through before stopping, as a share of a page. */
  attention: number;
}

export interface CardReaction {
  open: boolean;
  dwellMilliseconds: number;
  finish: boolean;
  save: boolean;
  dislike: boolean;
}

const NOTHING: CardReaction = {
  open: false,
  dwellMilliseconds: 0,
  finish: false,
  save: false,
  dislike: false,
};

/**
 * One reader's response to one card. An interest topic is opened most of the time, read for a
 * while, and sometimes finished or kept; the aversion topic mostly earns a 不感兴趣; anything
 * else is usually scrolled past, with an occasional curious open — a reader who never opens
 * anything unexpected would make the exploration lane untestable, and real ones do open things.
 */
export function reactToCard(
  persona: DiscoveryPersona,
  topicLabel: string,
  seedParts: readonly string[],
): CardReaction {
  const random = mulberry32(seedFromStrings([persona.name, topicLabel, ...seedParts]));
  if (topicLabel === persona.aversion) {
    return random() < 0.65 ? { ...NOTHING, dislike: true } : NOTHING;
  }
  const interested = persona.interests.includes(topicLabel);
  const openChance = interested ? 0.75 : 0.08;
  if (random() >= openChance) return NOTHING;

  const dwellMilliseconds = Math.round((interested ? 45_000 : 8_000) + random() * 60_000);
  const finish = interested && random() < 0.5;
  const save = interested && random() < 0.3;
  return { open: true, dwellMilliseconds, finish, save, dislike: false };
}

/** How many cards of a page this reader actually gets through today. */
export function cardsReadToday(
  persona: DiscoveryPersona,
  pageSize: number,
  dayIndex: number,
): number {
  const random = mulberry32(seedFromStrings([persona.name, "day", String(dayIndex)]));
  const share = persona.attention * (0.6 + random() * 0.8);
  return Math.max(1, Math.min(pageSize, Math.round(pageSize * share)));
}
