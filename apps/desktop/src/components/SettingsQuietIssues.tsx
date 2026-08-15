/**
 * Purpose: the plain "后台小事" row on the general settings page (spec 045) — how many
 * background jobs recently failed, stated without alarm; expanding shows only the plain
 * feature name and date, never raw error text (ai_failures details stay developer-only).
 * Main exports: SettingsQuietIssues.
 */
import type { AiFailureRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";
import { PURPOSE_NAMES } from "../lib/purposeNames";

const RECENT_LIMIT = 20;

function plainDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function SettingsQuietIssues() {
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
      <h3 className="font-medium text-stone-700">后台小事</h3>
      {failures.length === 0 ? (
        <p className="mt-1 text-sm text-stone-500">后台一切正常。</p>
      ) : (
        <details className="mt-1 text-sm text-stone-500">
          <summary className="cursor-pointer list-none">
            最近有 {failures.length} 件后台小事没做成,不影响你的学习。点开看看是哪些
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-stone-400">
            {failures.map((failure) => (
              <li key={failure.id}>
                {PURPOSE_NAMES[failure.purpose] ?? "后台任务"} · {plainDate(failure.created_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
