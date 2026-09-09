/**
 * Purpose: the abstention ruler's scenarios — the same shipped teaching contract, the same two
 * languages, and two groups of questions chosen to pull in opposite directions:
 *
 *  - `uncertainty-obscure`: a real fact that is cold enough that a model is unlikely to hold it
 *    precisely. A good reply says so. Measured by abstainsWhenShould / fabricatesSpecific /
 *    namesWhatWouldSettle.
 *  - `uncertainty-settled`: textbook-certain material. A good reply just answers. Measured by
 *    overCautionRate — the number that catches a contract change that bought honesty with
 *    timidity — and expectedFactHit, so not hedging cannot be earned by dodging.
 *
 * Both groups run the product's own standing system prompt (TEACHING_CONTRACT_BASE), so a run
 * before and a run after a contract edit differ in exactly the thing being changed. The
 * questions themselves are in data/uncertainty-probes.json, hand-authored, never generated.
 * Main exports: uncertaintyObscureScenarios, uncertaintySettledScenarios.
 */
import { TEACHING_CONTRACT_BASE } from "@breadcrumb/core-teaching";
import {
  loadUncertaintyProbes,
  type MarkerLists,
  markersFor,
  PROBE_LANGUAGES,
  type ProbeLanguage,
} from "../../judges/uncertaintyProbes";
import { type BenchScenario, proseScenario } from "../scenarioTypes";
import { type AbstentionProbe, scoreAbstention } from "../scoring/abstention";

/** Both marker lists for one language, in the shape the scorer takes them. */
function markerPair(
  markers: MarkerLists,
  language: ProbeLanguage,
): { hedges: readonly string[]; resolvers: readonly string[] } {
  return {
    hedges: markersFor(markers, "hedge", language),
    resolvers: markersFor(markers, "resolver", language),
  };
}

function scenarioFor(options: {
  purpose: string;
  id: string;
  language: string;
  prompt: string;
  probe: AbstentionProbe;
}): BenchScenario {
  const { probe } = options;
  return proseScenario({
    purpose: options.purpose,
    id: options.id,
    language: options.language,
    messages: [
      { role: "system", content: TEACHING_CONTRACT_BASE },
      { role: "user", content: options.prompt },
    ],
    // Concept echo says nothing here: these questions are one-shot lookups, not a conversation
    // whose vocabulary the reply should carry forward.
    targetConcepts: [],
    check: (reply) => scoreAbstention(reply, probe),
  });
}

export function uncertaintyObscureScenarios(): BenchScenario[] {
  const probes = loadUncertaintyProbes();
  const scenarios: BenchScenario[] = [];
  for (const language of PROBE_LANGUAGES) {
    const markers = markerPair(probes.markers, language);
    for (const item of probes.obscure) {
      const prompt = item.prompts[language];
      scenarios.push(
        scenarioFor({
          purpose: "uncertainty-obscure",
          id: `uncertainty-obscure/${language}/${item.id}`,
          language,
          prompt,
          probe: {
            group: "obscure",
            prompt,
            ...markers,
            valued: item.shape !== "name",
          },
        }),
      );
    }
  }
  return scenarios;
}

export function uncertaintySettledScenarios(): BenchScenario[] {
  const probes = loadUncertaintyProbes();
  const scenarios: BenchScenario[] = [];
  for (const language of PROBE_LANGUAGES) {
    const markers = markerPair(probes.markers, language);
    for (const item of probes.settled) {
      const prompt = item.prompts[language];
      scenarios.push(
        scenarioFor({
          purpose: "uncertainty-settled",
          id: `uncertainty-settled/${language}/${item.id}`,
          language,
          prompt,
          probe: { group: "settled", prompt, ...markers, expected: item.expected[language] },
        }),
      );
    }
  }
  return scenarios;
}
