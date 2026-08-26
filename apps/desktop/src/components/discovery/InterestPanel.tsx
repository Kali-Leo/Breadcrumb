/**
 * Purpose: the shell every interest panel sits in, plus the pill switch its header carries —
 * same visual language as the palace's 休闲/目标 switch so the app keeps one vocabulary of
 * controls.
 * Main exports: InterestPanel, InterestSegmentedControl.
 */
import type { ReactNode } from "react";

export function InterestPanel({
  title,
  controls,
  children,
}: {
  title: string;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-sm text-stone-700">{title}</h2>
        {controls}
      </header>
      {children}
    </section>
  );
}

export interface SegmentedOption<TValue extends string | number> {
  value: TValue;
  label: string;
}

export function InterestSegmentedControl<TValue extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
  onChange(next: TValue): void;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-stone-300 bg-white text-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1 transition-colors ${
            option.value === value ? "bg-amber-500 text-white" : "text-stone-500 hover:bg-stone-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function InterestPanelEmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-stone-400">{children}</p>;
}
