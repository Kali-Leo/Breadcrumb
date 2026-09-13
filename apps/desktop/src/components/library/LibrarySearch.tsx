/**
 * Purpose: a box to search what has been imported, and the passages it finds.
 *
 * It is here for the reader, and it is also the only place the two-stage import is visible as
 * a fact rather than as a claim: type a phrase seconds after importing a book and it is found,
 * long before a single vector exists. That is what the progress line above means, shown
 * instead of asserted.
 *
 * What comes back is the parent block — the ~512-token section the matched sentences sit in —
 * under its heading path, because a sentence out of its section is a fragment and the path is
 * how a reader knows which book and which chapter they are looking at.
 * Main exports: LibrarySearch.
 */
import type { RetrievedPassage } from "@breadcrumb/core-retrieval";
import { Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { retrieveFromLibrary } from "../../lib/library/libraryRetrieval";

export function LibrarySearch() {
  const { t, i18n } = useTranslation("library");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RetrievedPassage[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const question = query.trim();
    if (question === "" || searching) return;
    setSearching(true);
    try {
      setResults(await retrieveFromLibrary(question, i18n.language, { topK: 5 }));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={(event) => void submit(event)} className="flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search.placeholder")}
          className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-sm outline-none focus:border-stone-400"
        />
        <button
          type="submit"
          disabled={searching}
          aria-label={t("search.action")}
          className="rounded-lg border border-stone-200 p-2 text-stone-500 transition-colors hover:bg-stone-50 disabled:opacity-50"
        >
          <Search size={15} strokeWidth={1.8} />
        </button>
      </form>

      {results !== null && results.length === 0 && (
        <p className="text-sm text-stone-400">{t("search.empty")}</p>
      )}

      {results?.map((passage) => (
        <article key={passage.id} className="rounded-lg bg-stone-50 p-3">
          <p className="text-stone-400 text-xs">{passage.headingPath}</p>
          <p className="mt-1 line-clamp-6 whitespace-pre-wrap text-sm text-stone-700 leading-relaxed">
            {passage.body}
          </p>
        </article>
      ))}
    </div>
  );
}
