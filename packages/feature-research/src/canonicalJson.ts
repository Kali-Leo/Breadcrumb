/**
 * Purpose: deterministic JSON serialization (sorted object keys, no whitespace) so a task
 * payload signs and verifies identically regardless of how it was re-serialized in transit.
 * Main export: canonicalJsonStringify.
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function canonicalJsonStringify(value: unknown): string {
  return serialize(value as JsonValue);
}

function serialize(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  const entries = Object.entries(value)
    .filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const body = entries.map(
    ([key, entryValue]) => `${JSON.stringify(key)}:${serialize(entryValue)}`,
  );
  return `{${body.join(",")}}`;
}
