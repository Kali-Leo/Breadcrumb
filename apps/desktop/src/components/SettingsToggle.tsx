/**
 * Purpose: the small pill switch shared by every feature-switch row on the settings page. It is
 * a switch to a screen reader as well as to the eye (role + aria-checked), following the same
 * judgement as the segmented pills of spec 052: a control whose state is carried entirely by
 * colour and position has to say that state out loud.
 * Main exports: Toggle.
 */

export function Toggle({ on, onClick, label }: { on: boolean; onClick(): void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      aria-label={label}
      className={`h-7 w-13 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-amber-500" : "bg-stone-300"}`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-0"}`}
      />
    </button>
  );
}
