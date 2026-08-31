/**
 * Purpose: what a person sees the very first time they open Breadcrumb. Before this, the app
 * jumped straight to a settings form with three empty fields — a stranger had no way to know
 * what the app was, why it wanted an API key, or what using it would cost them.
 *
 * Three steps, each answering one question a newcomer actually has: what is this, how do I
 * connect it, and what does it cost and where does my writing go. The AI-service form is the
 * real one from settings, so there is no second implementation to drift.
 * Main exports: FirstRunGuide.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../stores/settingsStore";
import { ApiSettingsSection } from "./ApiSettingsSection";

type Step = "what" | "connect" | "terms";

const STEPS: readonly Step[] = ["what", "connect", "terms"];

export function FirstRunGuide({ onDone }: { onDone(): void }) {
  const { t } = useTranslation(["onboarding", "common"]);
  const [step, setStep] = useState<Step>("what");
  const apiConfig = useSettingsStore((state) => state.apiConfig);

  const index = STEPS.indexOf(step);
  const isLast = index === STEPS.length - 1;

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-stone-50 px-6 py-10">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center gap-1.5" aria-hidden>
          {STEPS.map((name) => (
            <span
              key={name}
              className={`h-1 flex-1 rounded-full ${
                STEPS.indexOf(name) <= index ? "bg-amber-400" : "bg-stone-200"
              }`}
            />
          ))}
        </div>

        {step === "what" && (
          <section className="space-y-4">
            <h1 className="font-semibold text-2xl text-stone-700">{t("what.title")}</h1>
            <p className="text-stone-600 leading-relaxed">{t("what.body")}</p>
            <ul className="space-y-2 text-sm text-stone-500">
              <li>{t("what.point1")}</li>
              <li>{t("what.point2")}</li>
              <li>{t("what.point3")}</li>
            </ul>
          </section>
        )}

        {step === "connect" && (
          <section className="space-y-4">
            <h1 className="font-semibold text-2xl text-stone-700">{t("connect.title")}</h1>
            <p className="text-stone-600 leading-relaxed">{t("connect.body")}</p>
            <ApiSettingsSection />
            <p className="text-sm text-stone-500">{t("connect.help")}</p>
          </section>
        )}

        {step === "terms" && (
          <section className="space-y-4">
            <h1 className="font-semibold text-2xl text-stone-700">{t("terms.title")}</h1>
            <p className="text-stone-600 leading-relaxed">{t("terms.privacy")}</p>
            <p className="text-stone-600 leading-relaxed">{t("terms.cost")}</p>
            <p className="text-stone-600 leading-relaxed">{t("terms.switches")}</p>
          </section>
        )}

        <div className="flex items-center gap-3 pt-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setStep(STEPS[index - 1] as Step)}
              className="rounded-xl px-4 py-2 text-sm text-stone-500 hover:bg-stone-100"
            >
              {t("back")}
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onDone() : setStep(STEPS[index + 1] as Step))}
            className="rounded-xl bg-amber-500 px-5 py-2 text-white transition-colors hover:bg-amber-600"
          >
            {isLast ? t("start") : t("next")}
          </button>
          {/* Skippable at every step. Someone who wants to look around before handing over an
              API key should be able to; the chat says plainly what it needs when they try. */}
          <button
            type="button"
            onClick={onDone}
            className="ms-auto text-sm text-stone-400 underline"
          >
            {t("skip")}
          </button>
        </div>

        {step === "connect" && apiConfig === null && (
          <p className="text-stone-400 text-xs">{t("connect.notYetSaved")}</p>
        )}
      </div>
    </div>
  );
}
