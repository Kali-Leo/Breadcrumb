/**
 * Purpose: backup and restore for the browser edition, where the database sits inside storage
 * only this page can reach. On the desktop the file is already on disk and copying it is the
 * learner's business; in a browser there is otherwise no way at all to move a year of learning
 * to a new machine, or to keep a copy of it. So this section exists only when the two commands
 * behind it do — `export_database` / `import_database` are shims, not Rust commands.
 *
 * Restoring is the one irreversible thing on this page, so it takes two steps: pick the file,
 * read what it will do, then confirm. The worker refuses anything that is not an SQLite
 * database before it writes a byte, so a wrong file costs a sentence and nothing else.
 * Main exports: DataBackupSection.
 */

import { invoke } from "@tauri-apps/api/core";
import { type ChangeEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isBrowserEdition } from "../../lib/platform/edition";

/** Local calendar day, so a backup made in the evening is not filed under tomorrow. */
function todayStamp(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function DataBackupSection() {
  const { t } = useTranslation(["settings", "common"]);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [failed, setFailed] = useState<"export" | "import" | null>(null);
  const [pending, setPending] = useState<Uint8Array | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!isBrowserEdition()) return null;

  const buttonClass =
    "rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-50 coarse:min-h-11";

  async function exportBackup(): Promise<void> {
    setBusy("export");
    setFailed(null);
    try {
      const bytes = await invoke<Uint8Array>("export_database");
      const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `breadcrumb-${todayStamp()}.db`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed("export");
    } finally {
      setBusy(null);
    }
  }

  async function readChosenFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file twice still fires a change event.
    event.target.value = "";
    if (file === undefined) return;
    setFailed(null);
    setPending(new Uint8Array(await file.arrayBuffer()));
  }

  async function restore(): Promise<void> {
    if (pending === null) return;
    setBusy("import");
    try {
      await invoke("import_database", { bytes: pending });
      // The connection behind every open store now points at a different database; reloading
      // is the one way to be sure nothing on screen is still showing the old one.
      globalThis.location.reload();
    } catch {
      setFailed("import");
      setBusy(null);
      setPending(null);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-medium text-stone-700">{t("backup.title")}</h3>
      <p className="mt-1 text-sm text-stone-500">{t("backup.hint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={busy !== null}
          onClick={() => void exportBackup()}
        >
          {busy === "export" ? t("backup.exporting") : t("backup.export")}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy !== null || pending !== null}
          onClick={() => fileInput.current?.click()}
        >
          {t("backup.import")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".db,.sqlite,.sqlite3,application/x-sqlite3"
          className="hidden"
          onChange={(event) => void readChosenFile(event)}
        />
      </div>

      {pending !== null && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <p className="text-sm text-stone-600">{t("backup.replaceWarning")}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm text-white transition-colors hover:bg-amber-600 disabled:opacity-50 coarse:min-h-11"
              disabled={busy !== null}
              onClick={() => void restore()}
            >
              {busy === "import" ? t("backup.importing") : t("backup.confirmImport")}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy !== null}
              onClick={() => setPending(null)}
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}

      {failed !== null && (
        <p className="mt-3 text-sm text-stone-500">
          {failed === "export" ? t("backup.exportFailed") : t("backup.importFailed")}
        </p>
      )}
    </section>
  );
}
