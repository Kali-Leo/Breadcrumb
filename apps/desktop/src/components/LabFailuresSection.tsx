/**
 * Purpose: lab-panel collapsed section listing the most recent silent AI-pipeline failures
 * (spec 014, ai_failures table) — developer-visible only, never shown to the user elsewhere.
 * Main exports: LabFailuresSection.
 */
import type { AiFailureRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";

const RECENT_FAILURE_LIMIT = 20;

function firstLine(message: string): string {
  return message.split("\n")[0] ?? message;
}

export function LabFailuresSection() {
  const [failures, setFailures] = useState<AiFailureRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const repos = await getRepos();
        const recent = await repos.aiFailures.listRecent(RECENT_FAILURE_LIMIT);
        if (!cancelled) setFailures(recent);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <details className="rounded border border-stone-200">
      <summary className="cursor-pointer px-2 py-1 font-semibold text-stone-600">
        最近的静默失败
      </summary>
      <div className="border-t border-stone-100 px-2 py-1">
        {!loaded ? (
          <p className="text-stone-400">加载中…</p>
        ) : failures.length === 0 ? (
          <p className="text-stone-400">最近没有失败记录</p>
        ) : (
          <ul className="space-y-1">
            {failures.map((failure) => (
              <li key={failure.id} className="text-stone-500">
                <span className="text-stone-400">{failure.created_at}</span>{" "}
                <span className="font-medium">{failure.purpose}</span>{" "}
                <span>{firstLine(failure.message)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
