/**
 * Purpose: the screen where someone puts their own material into the app — a book they
 * bought, a course handout, their own notes — and watches it become searchable.
 *
 * Two things this screen has to be honest about, and they are the reason it exists at all
 * rather than the import being a button somewhere in settings.
 *
 * The first is provenance. The introduction names the sources that are actually all right to
 * use and does not hedge. A feature that accepts "any PDF" without ever saying so is quietly
 * inviting something this product has no business inviting.
 *
 * The second is that an import finishes twice. The keyword index is built during the import,
 * so the material is searchable within seconds; the semantic index is filled in afterwards, in
 * the background, and can take a while. So the progress line stays on screen and says both
 * things — how far the second pass has got, and that searching already works. And where the
 * measurement says this browser is the slow part, one line of advice sits beside it: which
 * browser, or which update. Never a dialog, never in the way, and never in the vocabulary of
 * runtimes — see librarySpeedHint.ts. A scanned book adds a step before either: its pages have
 * to be read, a second or two each, and the same line says which page it is on.
 * Main exports: LibraryPanel.
 */
import { Trash2, Upload } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "../../stores/libraryStore";
import { LibrarySearch } from "./LibrarySearch";

/** The same line, in one of three states: a scan being read (page N of M), the vector pass
 * (passage N of M), or done. Reading comes first because it happens first, and while it is
 * happening the vector count is about the previous book. */
function ImportProgress() {
  const { t } = useTranslation("library");
  const embedded = useLibraryStore((state) => state.embedded);
  const total = useLibraryStore((state) => state.total);
  const recognizing = useLibraryStore((state) => state.recognizing);
  const speedAdvice = useLibraryStore((state) => state.speedAdvice);
  if (recognizing !== null) {
    const percent = Math.round(((recognizing.page - 1) / recognizing.pageCount) * 100);
    return (
      <div className="rounded-xl bg-stone-50 p-3 text-sm" data-progress="recognizing">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-stone-600">
            {t("progress.recognizing", { page: recognizing.page, total: recognizing.pageCount })}
          </span>
          <span className="text-stone-400 text-xs tabular-nums">{percent}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }
  if (total === 0) return null;
  const done = embedded >= total;
  const percent = Math.round((embedded / total) * 100);
  return (
    <div className="rounded-xl bg-stone-50 p-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-stone-600">
          {done ? t("progress.ready") : t("progress.building", { embedded, total })}
        </span>
        <span className="text-stone-400 text-xs tabular-nums">{percent}%</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} />
      </div>
      {!done && <p className="mt-2 text-stone-500 text-xs">{t("progress.usable")}</p>}
      {/* Advice, not an alert: same size, same colour as the line above it. */}
      {speedAdvice !== null && <p className="mt-1 text-stone-500 text-xs">{t(speedAdvice)}</p>}
    </div>
  );
}

function DocumentList() {
  const { t } = useTranslation("library");
  const documents = useLibraryStore((state) => state.documents);
  const remove = useLibraryStore((state) => state.remove);
  if (documents.length === 0) {
    return <p className="py-6 text-center text-sm text-stone-400">{t("empty")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {documents.map((document) => (
        <li
          key={document.id}
          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-stone-700">{document.title}</span>
          <span className="text-stone-400 text-xs uppercase">{document.media_type}</span>
          <button
            type="button"
            onClick={() => void remove(document.id)}
            title={t("remove")}
            aria-label={t("remove")}
            className="rounded p-1 text-stone-300 opacity-0 transition-opacity hover:bg-stone-100 hover:text-stone-600 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 size={15} strokeWidth={1.8} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function LibraryPanel() {
  const { t } = useTranslation("library");
  const load = useLibraryStore((state) => state.load);
  const importDocument = useLibraryStore((state) => state.importDocument);
  const importing = useLibraryStore((state) => state.importing);
  const errorKey = useLibraryStore((state) => state.errorKey);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-5">
      <div>
        <h1 className="font-medium text-lg text-stone-800">{t("title")}</h1>
        <p className="mt-1 text-sm text-stone-500 leading-relaxed">{t("intro")}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void importDocument()}
          disabled={importing}
          data-hint="libraryImport"
          className="flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-2 text-sm text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          <Upload size={15} strokeWidth={1.8} />
          {importing ? t("importing") : t("import")}
        </button>
        <span className="text-stone-400 text-xs">{t("formats")}</span>
      </div>

      {errorKey !== null && <p className="text-rose-600 text-sm">{t(errorKey)}</p>}

      <ImportProgress />
      <LibrarySearch />
      <DocumentList />
    </div>
  );
}
