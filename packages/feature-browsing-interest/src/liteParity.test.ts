/**
 * The port has to *be* the reference, not merely resemble it. This loads the original
 * `interest-model/lite/interest_lite.js` from Kali-Leo/feed-mode and runs it side by side with
 * this package, asserting the numbers match exactly — `toBe` on doubles, no tolerance — for the
 * classifier input string, the 48-way distribution, a 200-event sequence, and affinity with a
 * declared preference applied.
 *
 * Exact equality is the right assertion here, not a loose one, because the port preserves the
 * reference's arithmetic *order*: the same accumulation over the same count map in insertion
 * order, the same max-shifted softmax, the same `weight * p * factor` grouping. A tolerance
 * would pass while quietly permitting a reordering that drifts over a long history.
 *
 * The one thing deliberately NOT shared is the clock policy: this package defaults to the
 * daemon's rules (see profileEngine), and only `LITE_CLOCK` reproduces the reference. That is
 * why the sequence below passes LITE_CLOCK explicitly.
 *
 * The reference is a checkout, not a dependency. Where it is absent this suite skips instead of
 * failing; point FEED_MODE_DIR at an `interest-model` directory to run it elsewhere.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type BrowsingEventType,
  createProfileState,
  ingestEvent,
  LITE_CLOCK,
} from "./profileEngine";
import { normalizeShares, setTopicPreference, topicAffinity } from "./profileShares";
import { TOPIC_LEAVES } from "./taxonomy";
import { classifierText, topicProbabilities } from "./topicModel";

interface LiteModule {
  proba(title: string, up: string): number[];
  ingest(event: { t: string; u: string; type: string; dwell?: number; ts?: number }): void;
  profile(): { short: number[]; long: number[]; expose: number[]; n: number };
  setPref(topic: string, value: number): void;
  affinity(title: string, up: string): number;
  importState(json: string): boolean;
  exportState(): string;
}

const referenceDir =
  process.env.FEED_MODE_DIR ?? join(homedir(), "桌面", "bilibili", "interest-model");
const referencePath = join(referenceDir, "lite", "interest_lite.js");

const emptyLiteState = JSON.stringify({
  short: new Array<number>(48).fill(0),
  long: new Array<number>(48).fill(0),
  expose: new Array<number>(48).fill(0),
  ts: null,
  prefs: {},
  n: 0,
});

const TITLES: ReadonlyArray<readonly [string, string]> = [
  ["从零实现一个 Rust 编译器", "编程学习频道"],
  ["【震惊】猫🐱竟然会开门", "萌宠日记"],
  ["", ""],
  ["  多余   空格    要被折叠  ", "  UP  "],
  ["高等数学 极限的 ε-δ 定义", "考研数学"],
  ["今天做了一锅红烧肉", "美食家老王"],
];

// Loaded out here, not inside the suite: vitest still runs a skipped suite's body during
// collection, so a require in there throws on every machine that has no checkout.
const liteOrNull = existsSync(referencePath)
  ? (createRequire(import.meta.url)(referencePath) as LiteModule)
  : null;

describe.skipIf(liteOrNull === null)("parity with interest_lite.js", () => {
  const lite = liteOrNull as LiteModule;

  it("keeps the taxonomy in the reference's order — index i IS weight-matrix column i", () => {
    // Read the literal out of the reference source rather than trusting the JSON: taxonomy.json
    // and interest_lite.js are two files that must agree, and nothing else would notice if a
    // future edit reordered one of them. A silent reorder relabels every topic in the app.
    const source = readFileSync(referencePath, "utf8");
    const literal = /const TOPICS = (\[[\s\S]*?\]);/.exec(source)?.[1];
    expect(literal).toBeDefined();
    expect(TOPIC_LEAVES).toEqual(JSON.parse(literal ?? "[]"));
    expect(TOPIC_LEAVES).toHaveLength(48);
  });

  it("builds the same classifier input string", () => {
    for (const [title, up] of TITLES) {
      const expected = `${title} \u0001 ${up}`.toLowerCase().replace(/\s\s+/g, " ");
      expect(classifierText(title, up)).toBe(expected);
    }
  });

  it("produces bit-identical topic distributions", () => {
    for (const [title, up] of TITLES) {
      const reference = lite.proba(title, up);
      const ported = topicProbabilities(title, up);
      expect(ported).toHaveLength(reference.length);
      for (let i = 0; i < reference.length; i++) expect(ported[i]).toBe(reference[i]);
    }
  });

  it("accumulates a 240-event sequence identically", () => {
    lite.importState(emptyLiteState);
    const state = createProfileState();
    const start = Date.UTC(2026, 0, 1);
    const types: readonly BrowsingEventType[] = ["expose", "click", "watch"];
    let index = 0;
    for (let day = 0; day < 40; day++) {
      for (const [title, up] of TITLES) {
        const type = types[index % types.length] ?? "expose";
        const dwell = type === "watch" ? (index % 17) * 41.5 : 0;
        const ts = start + day * 86400e3 + index * 971e3;
        lite.ingest({ t: title, u: up, type, dwell, ts });
        ingestEvent(state, topicProbabilities(title, up), { type, dwell, ts }, ts, LITE_CLOCK);
        index++;
      }
    }
    const reference = lite.profile();
    expect(state.n).toBe(240);
    expect(state.n).toBe(reference.n);
    for (const key of ["short", "long", "expose"] as const) {
      const ported = normalizeShares(state[key]);
      for (let i = 0; i < 48; i++) expect(ported[i]).toBe(reference[key][i]);
    }
  });

  it("scores affinity identically once a preference is declared", () => {
    const topic = TOPIC_LEAVES[1] ?? "";
    lite.setPref(topic, 1.75);
    // exportState() hands over the RAW accumulators. Seeding from profile()'s already
    // normalised shares would re-normalise a second time and shift the result by one ulp —
    // exactly the kind of drift this suite exists to catch, so the harness must not add it.
    const reference = JSON.parse(lite.exportState()) as {
      short: number[];
      long: number[];
      expose: number[];
      n: number;
    };
    const mirrored = createProfileState();
    mirrored.short = [...reference.short];
    mirrored.long = [...reference.long];
    mirrored.expose = [...reference.expose];
    mirrored.n = reference.n;
    expect(setTopicPreference(mirrored, topic, 1.75)).toBe(true);
    for (const [title, up] of TITLES)
      expect(topicAffinity(mirrored, topicProbabilities(title, up))).toBe(lite.affinity(title, up));
  });
});
