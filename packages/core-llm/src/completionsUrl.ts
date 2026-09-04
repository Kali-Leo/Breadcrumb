/**
 * Purpose: turning the user-configured `baseUrl` into the one URL both chat calls post to.
 * Its own module so the streaming client and the JSON client cannot drift apart on what a
 * usable endpoint is: the API key travels as a Bearer header, so plaintext http off the
 * loopback interface hands the key and the whole conversation to anyone on the path.
 * Main exports: completionsUrl.
 */

/** Plain http is allowed here and nowhere else: a local Ollama / LM Studio / llama.cpp
 * server is a legitimate, and common, endpoint and has no certificate. Everything reachable
 * off the machine must be https. Hostnames as WHATWG `URL` normalizes them — IPv6 keeps its
 * brackets, so `[::1]` is the form that ever gets compared. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The path segment every OpenAI-compatible provider serves chat on. Compared in lower case
 * because it is what the learner typed, not what a machine generated. */
const COMPLETIONS_PATH = "/chat/completions";

/**
 * `${baseUrl}/chat/completions`, validated. Throws (internal English, never shown to the
 * learner — the caller turns a failure into its own copy) when the baseUrl is not parseable
 * or would put the key on the wire in the clear. Any query string or fragment is dropped:
 * `https://a.example/v1?x=` would otherwise splice into `...?x=/chat/completions` and post
 * the whole conversation to a silently wrong endpoint.
 *
 * A baseUrl that ALREADY ends in `/chat/completions` is left alone rather than doubled. Every
 * provider's quickstart shows the full endpoint next to the base URL, so pasting the wrong one
 * of the two is an ordinary mistake — and the result of doubling it is a 404 that says nothing
 * about what went wrong. Being tolerant here is not a guess about intent: there is no service
 * anywhere that serves `/chat/completions/chat/completions`.
 */
export function completionsUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("LLM baseUrl is not a valid absolute URL");
  }
  const loopback = LOOPBACK_HOSTNAMES.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("LLM baseUrl must be https (plain http is only allowed on loopback)");
  }
  parsed.search = "";
  parsed.hash = "";
  const path = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = path.toLowerCase().endsWith(COMPLETIONS_PATH)
    ? path
    : `${path}${COMPLETIONS_PATH}`;
  return parsed.toString();
}
