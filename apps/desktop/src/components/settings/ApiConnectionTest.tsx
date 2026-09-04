/**
 * Purpose: the one control that turns "it doesn't work" into a sentence someone can act on.
 * Saving credentials proved only that a text box had text in it; this button actually speaks
 * to the service and then says, in one line, what came back and what to do next.
 *
 * Every outcome gets its own line from settings.json — none of the provider's own words, and
 * no status codes, ever reach the screen.
 * Main exports: ApiConnectionTest.
 */
import type { ConnectionProbeOutcome } from "@breadcrumb/core-llm";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ApiConnectionTestProps {
  /** Runs the probe against whatever is in the boxes right now, saving it first if needed,
   * and resolves with what happened. Owned by the section so the result always describes the
   * configuration that is actually stored. */
  onTest(): Promise<ConnectionProbeOutcome>;
}

export function ApiConnectionTest({ onTest }: ApiConnectionTestProps) {
  const { t } = useTranslation("settings");
  const [testing, setTesting] = useState(false);
  const [outcome, setOutcome] = useState<ConnectionProbeOutcome | null>(null);

  async function run(): Promise<void> {
    setTesting(true);
    setOutcome(null);
    try {
      setOutcome(await onTest());
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={testing}
        onClick={() => void run()}
        className="rounded-xl border border-stone-300 px-4 py-2 text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60 coarse:min-h-11"
      >
        {t("api.testConnection")}
      </button>
      {/* One live region for both states, so a screen reader hears the answer arrive rather
          than having to go looking for it. */}
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${outcome === "ok" ? "text-emerald-700" : "text-stone-600"}`}
      >
        {testing && t("api.testing")}
        {!testing && outcome !== null && t(`api.testResult.${outcome}` as const)}
      </p>
    </div>
  );
}
