/**
 * Purpose: the credentials every AI feature runs on — endpoint, key, model name.
 * Main exports: ApiCredentialFields.
 */
import { useTranslation } from "react-i18next";
import { INPUT_CLASS } from "./apiSettingsForm";

export function ApiCredentialFields({
  baseUrl,
  apiKey,
  model,
  onEdit,
}: {
  baseUrl: string;
  apiKey: string;
  model: string;
  onEdit(patch: Partial<{ baseUrl: string; apiKey: string; model: string }>): void;
}) {
  const { t } = useTranslation(["settings", "common"]);
  return (
    <>
      <label className="block space-y-1 text-sm text-stone-500">
        {t("api.baseUrl")}
        <input
          value={baseUrl}
          onChange={(e) => onEdit({ baseUrl: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className="block space-y-1 text-sm text-stone-500">
        {t("api.apiKey")}
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onEdit({ apiKey: e.target.value })}
          placeholder="sk-…"
          className={INPUT_CLASS}
        />
      </label>
      <label className="block space-y-1 text-sm text-stone-500">
        {t("api.model")}
        <input
          value={model}
          onChange={(e) => onEdit({ model: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
    </>
  );
}
