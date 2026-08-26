/**
 * Purpose: word-cloud placement — font sizing, the outward spiral search and collision
 * checks, kept deterministic (own LCG, no Math.random) so the same words always land in the
 * same places. Ported from the dashboard the service ships. Text measurement is injected
 * because only the canvas knows how wide a word actually is.
 * Main exports: layoutWordCloud, valenceColor, wordFontWeight.
 */
import type { CloudWord } from "./schemas";

const MIN_FONT_SIZE = 13;
const FONT_SIZE_RANGE = 34;
const BOLD_FROM_FONT_SIZE = 26;
const SPIRAL_ATTEMPTS = 900;
const PLACEMENT_PADDING = 3;

export interface PlacedWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  vertical: boolean;
  color: string;
}

export interface WordCloudLayoutInput {
  words: CloudWord[];
  width: number;
  height: number;
  /** Width in pixels of `text` when drawn at `fontSize` with the weight this layout picks. */
  measureWidth(text: string, fontSize: number): number;
}

export function wordFontWeight(fontSize: number): number {
  return fontSize >= BOLD_FROM_FONT_SIZE ? 600 : 400;
}

/** Blue for content that felt good, red for content that felt bad, grey in between. */
export function valenceColor(valence: number): string {
  const t = Math.max(-2, Math.min(2, valence)) / 2;
  const middle = [122, 121, 117];
  const positive = [42, 120, 214];
  const negative = [194, 58, 57];
  const target = t >= 0 ? positive : negative;
  const weight = Math.abs(t);
  const channel = (index: number) => {
    const from = middle[index] as number;
    const to = target[index] as number;
    return Math.round(from + (to - from) * weight);
  };
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}

/** Park–Miller; seeded so a redraw of the same words is pixel-identical. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** Frequencies are long-tailed: gamma pulls the median word to the middle of the size range. */
function sizeCurve(counts: number[]): (count: number) => number {
  const highest = counts[0] ?? 1;
  const lowest = counts.at(-1) ?? 1;
  const normalize = (count: number) =>
    highest > lowest ? (count - lowest) / (highest - lowest) : 0.5;
  const median = normalize(counts[Math.floor(counts.length / 2)] ?? highest);
  const gamma =
    median > 0 && median < 1 ? Math.min(3, Math.max(0.3, Math.log(0.5) / Math.log(median))) : 1;
  return (count) => Math.round(MIN_FONT_SIZE + FONT_SIZE_RANGE * normalize(count) ** gamma);
}

export function layoutWordCloud(input: WordCloudLayoutInput): PlacedWord[] {
  const { words, width, height, measureWidth } = input;
  if (words.length === 0) return [];
  const fontSizeOf = sizeCurve(words.map((word) => word.n));
  const centerX = width / 2;
  const centerY = height / 2;
  const random = createRandom(7);
  const placed: PlacedWord[] = [];

  const collides = (x: number, y: number, boxWidth: number, boxHeight: number) =>
    x < 2 ||
    y < 2 ||
    x + boxWidth > width - 2 ||
    y + boxHeight > height - 2 ||
    placed.some(
      (other) =>
        x < other.x + other.width + PLACEMENT_PADDING &&
        x + boxWidth + PLACEMENT_PADDING > other.x &&
        y < other.y + other.height + PLACEMENT_PADDING &&
        y + boxHeight + PLACEMENT_PADDING > other.y,
    );

  for (const word of words) {
    const fontSize = fontSizeOf(word.n);
    const vertical = random() < 0.22 && word.w.length <= 4;
    const textWidth = measureWidth(word.w, fontSize);
    const boxWidth = vertical ? fontSize * 1.1 : textWidth;
    const boxHeight = vertical ? textWidth : fontSize * 1.15;
    let spot: { x: number; y: number } | null = null;
    for (let attempt = 0; attempt < SPIRAL_ATTEMPTS; attempt++) {
      const angle = 0.35 * attempt;
      const radius = 2.2 * angle;
      const x = centerX + radius * Math.cos(angle + random() * 0.3) - boxWidth / 2;
      const y = centerY + radius * 0.52 * Math.sin(angle + random() * 0.3) - boxHeight / 2;
      if (!collides(x, y, boxWidth, boxHeight)) {
        spot = { x, y };
        break;
      }
    }
    if (!spot) continue;
    placed.push({
      text: word.w,
      x: spot.x,
      y: spot.y,
      width: boxWidth,
      height: boxHeight,
      fontSize,
      vertical,
      color: valenceColor(word.valence),
    });
  }
  return placed;
}
