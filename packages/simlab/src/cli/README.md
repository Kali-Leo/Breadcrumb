# simlab artifacts format

This is the contract between `sim run`/`sim gold`/`sim recovery` (producers) and
`sim summarize` plus the Claude reviewer (consumers). Everything lives under
`packages/simlab/artifacts/<runId>/` (gitignored). The reviewer never re-derives
numbers from raw logs — every number it cites comes from `metrics.json`, and every
qualitative claim it makes cites a specific line in a `journey-*.jsonl` file (see
`docs/testing/simlab-评审协议.md`).

## Directory layout

```
artifacts/
  run-<timestamp>-<id>/        # from `sim run`
    journey-0.jsonl
    journey-1.jsonl
    ...
    metrics.json
    summary.md                 # from `sim summarize <runId>`, written after the run
    flagged/
      pressure-tutor-day2-abcd1234.json
      invariants-journey1-day5-ef012345.json
  gold-<timestamp>-<id>/       # from `sim gold`
    gold-baseline.json
  recovery-<timestamp>-<id>/   # from `sim recovery`
    recovery-result.json
```

## `journey-<n>.jsonl`

One JSON object per line, in chronological order, for journey `n` (0-indexed, matching
`--journeys`). Every line has an `event` field; the shapes are:

| `event`           | Extra fields                                                        | When |
|--------------------|-----------------------------------------------------------------------|------|
| `journey-start`    | `journeyId`, `personaId`, `days`, `startIso`                          | once, first line |
| `student-turn`     | `day`, `conversationId`, `round`, `content`, `usage`                   | every student reply, incl. the final `###STOP###` one |
| `tutor-turn`       | `day`, `conversationId`, `round`, `content`, `usage`                   | every tutor reply |
| `degenerate-turn`  | `day`, `conversationId`, `round`, `source` (`student`\|`tutor`)        | a reply trimmed to empty twice in a row (one retry already happened); the conversation ends early right after this line — the empty turn never reaches a pipeline |
| `topic-hint-mismatch` | `day`, `conversationId`, `round`, `expectedLabel`                    | round 0 only, when the prior journey-action set a concrete label hint (follow-frontier/revisit-old-topic — not a domain jump) and the student's opener never mentions it; soft telemetry, not a failure |
| `pipeline-stage`   | `day`, `conversationId?`, `round?`, `purpose`, and either `request`+`response` (success) or `error` (failure) | one per LLM-backed pipeline call: `knowledge-tree`, `knowledge-edges` (only when new nodes exist that round), `interest`, plus journey-action purposes `self-report-mapping`/`goal-planning`, and `trail-summary` (once per day with new nodes) |
| `journey-action`   | `day`, `action` (`follow-frontier`\|`self-report`\|`create-goal`\|`revisit-old-topic`\|`jump-new-domain`), `topicHint` | after every conversation, between-conversation |
| `day-digest`       | `day`, `digest` (see below)                                            | once per virtual day, after that day's conversations + trail summary |
| `journey-end`      | `journeyId`, `days`, `totalConversations`, `totalRounds`               | once, last line |

`pipeline-stage`'s `knowledge-edges` entries may also carry a bare
`{ purpose: "knowledge-edges", rejectedCyclicEdges: [...] }` line (no `request`/`response`)
whenever the edge-judge proposed a requires-edge that would have created a cycle and it
was dropped — this is the raw material for `metrics.json`'s `edgeNetwork.cycleRejectionCount`.

### `day-digest.digest` shape

```ts
{
  day: number;
  dateIso: string;
  nodeCount: number;              // total tree size at end of this day
  newNodeLabelsToday: string[];
  edgesAddedToday: number;
  edgesRejectedToday: number;
  topMasteryChanges: { label: string; from: number; to: number }[];   // top 10 by |delta|
  frontierTop5: { label: string; score: number; reason: string }[];  // human-readable reason
  goals: { title: string; coverage: number }[];
  interestAggregate: { avgCuriosity: number; avgConfusion: number; avgBoredom: number };
}
```

This is the compact per-day state snapshot — read it instead of replaying the whole
transcript to see how the tree/mastery/frontier evolved.

## `metrics.json`

Grouped by the four features this phase built, plus one cross-cutting section (see
`specs/013-simlab/spec.md` §4). Shape: `RunMetrics` in `src/judges/metrics.ts`. Top level:
`runId`, `requestedJourneys`, `completedJourneys`, `totalCostCny`, `budgetCny`, then:

- **`edgeNetwork`**: `cycleRejectionCount` (sum across journeys), `targetConceptsRecall`
  (average across journeys — see `src/judges/targetConceptsRecall.ts` for the matching rule).
- **`mastery`**: `reencounterBoostValid`, `idleDecayValid`, `detail` — a pure plugin-memory
  self-check (not journey-specific data; FSRS math doesn't depend on which journey ran).
- **`interest`**: `note` pointing at `sim recovery`'s `recovery-result.json` (scripted
  recovery is not computed as part of `sim run` — it moved to an on-demand subcommand
  per the "reframe simlab goals" spec amendment, see §`recovery-result.json` below).
- **`planner`**: `hardGateViolationCount` (must be 0), `reasonMismatchCount`,
  `coverageArithmeticViolationCount`, `totalInvariantChecks` — from the tripwire suite
  (`src/judges/invariants.ts`) run after every conversation.
- **`crossCutting`**: `zodFailureRateByPurpose` (per LLM-call purpose), `pressureLexiconHits`
  (`{ tutor, trailSummary }` counts).
- **`journeys`**: one row per completed journey (id, persona, days, conversations, rounds,
  new-node count, per-journey `targetConceptsRecall`).

## `flagged/`

One JSON file per anomaly, written the moment it's detected (not batched at the end).
Naming: `<kind>-<context>-<shortid>.json`.

- `pressure-<source>-day<N>-<id>.json` — a pressure-lexicon hit. `source` is `tutor` or
  `trail-summary`. Content: `PressureHitSample` (`source`, `day`, `conversationId?`,
  `round?`, `text`, `hits`).
- `invariants-journey<N>-day<D>-<id>.json` — one or more tripwire violations from a single
  `runInvariantsFromRepos` call. Content: `{ day, violations: Violation[] }`.

## `gold-baseline.json` (from `sim gold`)

`GoldBaselineResult` (`src/judges/goldBaseline.ts`): `totalPairs`, `requiresCount`,
`unrelatedCount`, `directionAccuracy`, `unrelatedRejectionRate`, and `judged` (every pair
with its expected relation and the model's actual judgement). No pass threshold — baseline
measurement against `data/gold-prerequisites.json`.

## `recovery-result.json` (from `sim recovery`)

`{ confusion: ScriptedRecoveryResult, boredom: ScriptedRecoveryResult }`
(`src/judges/scriptedRecovery.ts`): `personaId`, `expectedDominant`, `dominantSignal`,
`matches`, `averages`, `signalCount`. Also a baseline measurement, not a gate — see that
module's test file for why (curiosity outscored the scripted dominant signal in live
testing at 3 rounds; the mechanism works, the dominance claim just doesn't reliably hold).

## `summary.md` (from `sim summarize <runId>`)

Purely mechanical: reads `metrics.json` + lists `flagged/`, writes one Markdown section
per feature (`edgeNetwork`/`mastery`/`interest`/`planner`) plus one `crossCutting` section,
in that order, then a flagged-samples excerpt (top 10) and a journeys table. No LLM calls,
no re-computed numbers — see `src/cli/summaryMarkdown.ts`. This is the reviewer's *input
draft*; the reviewer still owes citations into the raw `journey-*.jsonl` files for any
qualitative judgment per the review protocol.
