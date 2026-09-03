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
      // The pill stays 28px tall because that is what a switch looks like; on a touch screen
      // an invisible 44px band centred on it takes the tap (WCAG 2.5.5 / Apple HIG).
      className={`relative h-7 w-13 shrink-0 rounded-full p-0.5 transition-colors coarse:after:absolute coarse:after:inset-x-0 coarse:after:top-1/2 coarse:after:h-11 coarse:after:-translate-y-1/2 coarse:after:content-[''] ${on ? "bg-amber-500" : "bg-stone-300"}`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6 rtl:-translate-x-6" : "translate-x-0"}`}
      />
    </button>
  );
}
