/**
 * Purpose: the plain "后台小事" row on the general settings page (spec 045) — how many
 * background jobs recently failed, stated without alarm; expanding shows only the plain
 * feature name and date, never raw error text (ai_failures details stay developer-only).
 * Main exports: SettingsQuietIssues.
 */
import type { AiFailureRow } from "@breadcrumb/core-db";
import { formatDayMonth } from "@breadcrumb/core-i18n";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRepos } from "../../lib/platform/db";

const RECENT_LIMIT = 20;

function plainDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatDayMonth(locale, date);
}

export function SettingsQuietIssues() {
  const { t, i18n } = useTranslation("settings");
  const [failures, setFailures] = useState<AiFailureRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repos = await getRepos();
      const recent = await repos.aiFailures.listRecent(RECENT_LIMIT);
      if (!cancelled) setFailures(recent);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h3 className="font-medium text-stone-700">{t("quietIssues.title")}</h3>
      {failures.length === 0 ? (
        <p className="mt-1 text-sm text-stone-500">{t("quietIssues.allGood")}</p>
      ) : (
        <details className="mt-1 text-sm text-stone-500">
          <summary className="cursor-pointer list-none coarse:flex coarse:min-h-11 coarse:items-center">
            {t("quietIssues.summary", { count: failures.length })}
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-stone-400">
            {failures.map((failure) => (
              <li key={failure.id}>
                {t(`purposes.${failure.purpose}` as never, {
                  defaultValue: t("quietIssues.fallbackPurpose"),
                })}{" "}
                · {plainDate(failure.created_at, i18n.language)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
