/**
 * Purpose: stands in for @tauri-apps/api/core's `invoke` in the browser build. Every Rust
 * command the desktop app can call is answered here — either with a browser implementation or
 * with an honest refusal.
 *
 * Refusing matters as much as implementing. Each of these commands already has a degradation
 * path on the desktop side (embeddings return null, TTS falls back to the browser's own voice,
 * the interest service is optional), so a rejected promise lands exactly where a missing
 * feature already lands. What must never happen is a command quietly resolving with a plausible
 * empty value, which would look like "there is nothing to embed" rather than "this build cannot
 * embed".
 * Main exports: invoke.
 */
import { embedTextsInBrowser } from "./embeddings";
import { openBrowserDatabase } from "./sqlite";

/** Thrown for commands this build genuinely cannot provide. The message reaches the same
 * console.warn / ai_failures paths the desktop build uses for a failed native call. */
class UnavailableInBrowser extends Error {
  constructor(command: string) {
    super(`${command} is not available in the browser edition`);
    this.name = "UnavailableInBrowser";
  }
}

interface TransactionArgs {
  statements: { sql: string; params: unknown[] }[];
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case "open_app_database": {
      await openBrowserDatabase();
      return "sqlite:breadcrumb.db" as T;
    }

    case "execute_sql_transaction": {
      const database = await openBrowserDatabase();
      const { statements } = args as unknown as TransactionArgs;
      await database.transaction(statements);
      return undefined as T;
    }

    case "embed_texts": {
      const { texts, allowDownload } = args as { texts: string[]; allowDownload: boolean };
      return (await embedTextsInBrowser(texts, allowDownload)) as T;
    }

    // Fitting FSRS parameters to one learner's own review history needs the fsrs-rs crate.
    // It is an optimisation over library defaults that only fires past 400 reviews, so its
    // absence costs accuracy at the margin and nothing else.
    case "optimize_fsrs_parameters":
      throw new UnavailableInBrowser(command);

    // Piper is a local binary. The word card already falls back to the browser's own
    // speechSynthesis, which is what a browser build should use anyway.
    case "piper_synthesize":
      throw new UnavailableInBrowser(command);

    // The browsing-interest service is a separate program listening on localhost. A page
    // cannot start a process, and reaching a local port from a website is exactly the kind of
    // thing browsers are right to prevent.
    case "start_interest_service":
    case "read_interest_service_token":
      throw new UnavailableInBrowser(command);

    default:
      throw new UnavailableInBrowser(command);
  }
}
