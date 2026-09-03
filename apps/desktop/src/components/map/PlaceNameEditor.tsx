/**
 * Purpose: a place's name with a quiet rename action beside it — the one entrance to the
 * learner's own map names. Click "rename" and the name turns into an inline field: Enter
 * saves, Escape cancels, an empty field restores the original name (the override is
 * removed). The name itself is whatever the caller shows, so the map, the rail and this
 * line can never disagree.
 * Main exports: PlaceNameEditor.
 */
import { type KeyboardEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMapPlaceNameStore } from "../../stores/mapPlaceNameStore";

interface PlaceNameEditorProps {
  nodeId: string;
  name: string;
  /** Classes for the name as shown when not editing — the caller keeps its own typography. */
  nameClassName: string;
}

export function PlaceNameEditor({ nodeId, name, nameClassName }: PlaceNameEditorProps) {
  const { t } = useTranslation("palace");
  const rename = useMapPlaceNameStore((state) => state.rename);
  const [draft, setDraft] = useState<string | null>(null);
  // Enter and Escape close the field themselves; the blur that follows must not save again
  // (or save a cancelled draft).
  const settledRef = useRef(false);

  function open() {
    settledRef.current = false;
    setDraft(name);
  }

  function commit(value: string) {
    if (settledRef.current) return;
    settledRef.current = true;
    setDraft(null);
    void rename(nodeId, value);
  }

  function cancel() {
    settledRef.current = true;
    setDraft(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(event.currentTarget.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  if (draft === null) {
    return (
      <span className="inline-flex min-w-0 items-baseline gap-2">
        <span className={nameClassName}>{name}</span>
        <button
          type="button"
          onClick={open}
          className="shrink-0 text-xs text-stone-400 hover:text-amber-700"
        >
          {t("map.rename")}
        </button>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <input
        // biome-ignore lint/a11y/noAutofocus: the field appears on the learner's own click
        autoFocus
        value={draft}
        aria-label={t("map.renameInputAria")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(event) => commit(event.currentTarget.value)}
        className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm text-stone-700 outline-none focus:border-amber-400 coarse:text-base"
      />
      <span className="text-xs text-stone-400">{t("map.renameHint")}</span>
    </span>
  );
}
