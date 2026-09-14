/**
 * Purpose: stands in for @tauri-apps/api/core's `invoke` in the browser build. Every Rust
 * command the desktop app can call is answered here — either with a browser implementation or
 * with an honest refusal.
 *
 * Refusing matters as much as implementing. Each of these commands already has a degradation
 * path on the desktop side (embeddings return null, TTS falls back to the browser's own voice,
 * the browsing collector is replaced by the page hand-off), so a rejected promise lands exactly
 * where a missing feature already lands. What must never happen is a command quietly resolving with a plausible
 * empty value, which would look like "there is nothing to embed" rather than "this build cannot
 * embed".
 * Main exports: invoke.
 */
import { embeddingSpeed, embedTextsInBrowser } from "./embeddings";
import { recognizePageInBrowser } from "./ocr";
import { exportDatabaseFile, importDatabaseFile, openBrowserDatabase } from "./sqlite";

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

/** Tauri's own signature: a JSON object, or raw bytes with the rest of the call in headers.
 * The desktop reads the headers on the Rust side; here they are read the same way. */
type InvokeArgs = Record<string, unknown> | number[] | ArrayBuffer | Uint8Array;
interface InvokeOptions {
  headers: HeadersInit;
}

function header(options: InvokeOptions | undefined, name: string): string {
  const value = new Headers(options?.headers).get(name);
  if (value === null) throw new Error(`${name} header is missing`);
  return value;
}

export async function invoke<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
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

    // Backup and restore exist only here. On the desktop the database is a file the learner
    // can already copy; in a browser it is inside storage nothing else can reach, so this is
    // the only way data can get out of one machine and into another. There is no Rust command
    // by these names, which is why the settings section that calls them is browser-only.
    case "export_database":
      return (await exportDatabaseFile()) as T;

    case "import_database": {
      const { bytes } = args as { bytes: Uint8Array };
      await importDatabaseFile(bytes);
      return undefined as T;
    }

    case "embed_texts": {
      const { texts, allowDownload } = args as { texts: string[]; allowDownload: boolean };
      return (await embedTextsInBrowser(texts, allowDownload)) as T;
    }

    // How the last batch actually went. Only this edition can answer, and only this edition
    // needs to: a browser is the one place where the same work can be four hundred times
    // slower depending on which browser it is, and the app says so — in terms of browsers,
    // never in terms of runtimes — when the measurement says the reader would notice.
    // The desktop build's invoke rejects on this name, which reads as "nothing to say".
    case "embedding_speed":
      return embeddingSpeed() as T;

    // Reading a scanned page. The pixels arrive as the raw body, the way the Rust command
    // takes them, and the size and the network switch ride in the headers.
    case "ocr_page": {
      if (!(args instanceof Uint8Array)) throw new Error("ocr_page takes raw RGBA bytes");
      const width = Number(header(options, "x-width"));
      const height = Number(header(options, "x-height"));
      const allowDownload = header(options, "x-allow-download") === "1";
      return (await recognizePageInBrowser(args, width, height, allowDownload)) as T;
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

    // The cross-encoder reranker is a Rust model. Library retrieval treats a rejection here
    // as "no second stage" and answers in fused order, so the browser edition searches the
    // reader's material with one stage fewer rather than not at all.
    case "rerank_pairs":
      throw new UnavailableInBrowser(command);

    // The browsing collector is a listener bound to 127.0.0.1, which only the desktop build
    // can open. This edition receives the same events a different way — a script on this very
    // page hands them over with postMessage (lib/platform/browsingChannels.ts) — so the
    // discovery page is complete here without either of these.
    case "browsing_collector_info":
    case "take_browsing_events":
      throw new UnavailableInBrowser(command);

    default:
      throw new UnavailableInBrowser(command);
  }
}
