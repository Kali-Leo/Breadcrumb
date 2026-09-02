/**
 * Purpose: spec 031 §3's optional naming stage — one batched LLM call names every clustered
 * continent that has no name yet, keyed by its member set so the same heap is never paid for
 * twice; the renamed assignment is memoized per input object so reopening the palace gets a
 * stable identity back. Tree continents are never touched (a root already carries its own
 * name), and any failure keeps the medoid name, so the map always draws.
 * Main exports: applyAiContinentNames.
 * Side effects: reads/writes the "mapTopicNameCache" settings row, meters the call, and logs
 * silent failures. The caller decides whether to call at all (switch + network + apiConfig).
 *
 * Storage (evaluated 2026-09-02 against map_place_names, source 'ai'): the names stay here,
 * keyed by member set, on purpose. A cluster continent's id is its earliest member's node id,
 * which is also that member kingdom's id — a node-keyed AI row would put the continent's
 * name on the kingdom too — and a member-set key is what lets a reshuffled cluster be named
 * afresh while an unchanged one is never paid for twice. The learner's own names
 * (lib/map/placeNames) are laid over the world AFTER these, so a user name always wins.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildContinentNamingMessages,
  type ContinentAssignment,
  type ContinentSummary,
  continentNameCacheKey,
  continentNamingSchema,
} from "@breadcrumb/feature-map";
import type { ApiConfig } from "../../stores/settingsStore";
import { recordFailedCallUsage, recordMeteredCall } from "../billing/metering";
import { getRepos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { llmConfigFrom } from "../platform/llmConfig";
import { nowIso } from "../platform/time";

const NAME_CACHE_KEY = "mapTopicNameCache";
const NAMING_PURPOSE = "map-naming";
/** Member labels handed to the model per cluster — enough to see the theme, not a wall. */
const LABELS_PER_CLUSTER = 12;

type NameCache = Record<string, string>;

/** Asks for one name per request id; continentNamingSchema now rejects an unusable name at
 * parse time (name.refine → isPlainContinentName), so a batch containing one is thrown away
 * whole by the caller's try/catch — every cluster in it keeps its medoid name and the batch
 * is asked about again next open, never a wrong name. */
async function requestNames(
  apiConfig: ApiConfig,
  requests: readonly { id: string; memberLabels: string[] }[],
): Promise<Map<string, string>> {
  const config = llmConfigFrom(apiConfig);
  const { parsed, usage } = await chatJson(
    config,
    buildContinentNamingMessages(requests),
    continentNamingSchema,
  );
  await recordMeteredCall({
    purpose: NAMING_PURPOSE,
    model: config.model,
    conversationId: null,
    usage,
  });
  return new Map(parsed.clusters.map((cluster) => [cluster.id, cluster.name.trim()]));
}

/** A cluster continent's kingdoms ARE its members, so their labels are the naming evidence. */
function memberLabels(continent: ContinentSummary): string[] {
  return continent.kingdoms.slice(0, LABELS_PER_CLUSTER).map((kingdom) => kingdom.label);
}

async function fetchMissingNames(
  apiConfig: ApiConfig,
  missing: readonly ContinentSummary[],
  cached: NameCache,
): Promise<NameCache> {
  const requests = missing.map((continent, index) => ({
    id: `c${index}`,
    memberLabels: memberLabels(continent),
    key: continentNameCacheKey(continent.memberNodeIds),
  }));
  const fresh = await requestNames(apiConfig, requests);
  const names: NameCache = { ...cached };
  for (const request of requests) {
    const name = fresh.get(request.id);
    if (name !== undefined) names[request.key] = name;
  }
  return names;
}

/**
 * Returns the assignment with clustered continents renamed. The object identity only changes
 * when at least one name actually changed, so callers can compare by reference. Memoized per
 * assignment object: the renamed result must keep a stable identity across palace reopens,
 * or cachedWorldModel misses and rebuilds the world on every open. An unchanged result
 * (nothing to name, or a failed call) is not kept, so the next open retries cheaply.
 */
export function applyAiContinentNames(
  assignment: ContinentAssignment,
  apiConfig: ApiConfig,
): Promise<ContinentAssignment> {
  const cached = namedAssignmentCache.get(assignment);
  if (cached !== undefined) return cached;
  const naming = applyNamesOnce(assignment, apiConfig).then((named) => {
    if (named === assignment) namedAssignmentCache.delete(assignment);
    return named;
  });
  namedAssignmentCache.set(assignment, naming);
  return naming;
}

const namedAssignmentCache = new WeakMap<ContinentAssignment, Promise<ContinentAssignment>>();

async function applyNamesOnce(
  assignment: ContinentAssignment,
  apiConfig: ApiConfig,
): Promise<ContinentAssignment> {
  const clusters = assignment.continents.filter((continent) => continent.origin === "cluster");
  if (clusters.length === 0) return assignment;

  try {
    const repos = await getRepos();
    const cached = (await repos.settings.get<NameCache>(NAME_CACHE_KEY)) ?? {};
    const keyByContinentId = new Map(
      clusters.map((continent) => [continent.id, continentNameCacheKey(continent.memberNodeIds)]),
    );
    const missing = clusters.filter(
      (continent) => cached[keyByContinentId.get(continent.id) ?? ""] === undefined,
    );

    let names = cached;
    if (missing.length > 0) {
      names = await fetchMissingNames(apiConfig, missing, cached);
      if (Object.keys(names).length !== Object.keys(cached).length) {
        await repos.settings.set(NAME_CACHE_KEY, names, nowIso());
      }
    }

    let changed = false;
    const continents = assignment.continents.map((continent) => {
      const name = names[keyByContinentId.get(continent.id) ?? ""];
      if (continent.origin !== "cluster" || name === undefined || name === continent.label) {
        return continent;
      }
      changed = true;
      return { ...continent, label: name };
    });
    return changed ? { continents, islets: assignment.islets } : assignment;
  } catch (error) {
    void recordAiFailure(NAMING_PURPOSE, error);
    void recordFailedCallUsage(error, {
      purpose: NAMING_PURPOSE,
      model: apiConfig.model,
      conversationId: null,
    });
    return assignment;
  }
}
