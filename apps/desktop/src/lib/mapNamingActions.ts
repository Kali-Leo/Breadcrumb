/**
 * Purpose: spec 031 §3's optional naming stage — one batched LLM call names every clustered
 * continent that has no name yet, keyed by its member set so the same heap is never paid for
 * twice. Tree continents are never touched (a root already carries its own name), and any
 * failure keeps the medoid name, so the map always draws.
 * Main exports: applyAiContinentNames.
 * Side effects: reads/writes the "mapTopicNameCache" settings row, meters the call, and logs
 * silent failures. The caller decides whether to call at all (switch + network + apiConfig).
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildContinentNamingMessages,
  type ContinentAssignment,
  type ContinentSummary,
  continentNameCacheKey,
  continentNamingSchema,
  isPlainContinentName,
} from "@breadcrumb/plugin-map";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";
import { nowIso } from "./time";

const NAME_CACHE_KEY = "mapTopicNameCache";
const NAMING_PURPOSE = "map-naming";
/** Member labels handed to the model per cluster — enough to see the theme, not a wall. */
const LABELS_PER_CLUSTER = 12;

type NameCache = Record<string, string>;

/** Asks for one name per request id; an unusable name is simply left out, so that cluster
 * keeps its medoid name and will be asked about again — one call, never a wrong name. */
async function requestNames(
  apiConfig: ApiConfig,
  requests: readonly { id: string; memberLabels: string[] }[],
): Promise<Map<string, string>> {
  const config = { ...apiConfig, fetchImpl: tauriFetch };
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
  const named = new Map<string, string>();
  for (const cluster of parsed.clusters) {
    if (isPlainContinentName(cluster.name)) named.set(cluster.id, cluster.name.trim());
  }
  return named;
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
 * when at least one name actually changed, so callers can compare by reference.
 */
export async function applyAiContinentNames(
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
    return assignment;
  }
}
