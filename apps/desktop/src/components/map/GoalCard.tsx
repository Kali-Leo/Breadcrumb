/**
 * Purpose: the map rail's goal card (spec 047) — lists the goals and offers one entry,
 * 目标设置, into the goal view (which handles both adding and viewing). No progress
 * fractions, no denominators (ladder rule: assessment is never displayed as a mechanism).
 * Main exports: GoalCard.
 */
import { usePlannerStore } from "../../stores/plannerStore";

interface GoalCardProps {
  onOpenGoalView(): void;
}

export function GoalCard({ onOpenGoalView }: GoalCardProps) {
  const goals = usePlannerStore((state) => state.goals);

  return (
    <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
      <h3 className="font-semibold text-stone-600">学习目标</h3>
      {goals.length === 0 ? (
        <p className="mt-1 text-stone-400">有想去的方向？建一个目标,我来拆解成知识点。</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1">
          {goals.map((goal) => (
            <li key={goal.id} className="rounded bg-stone-100 px-2 py-0.5 text-stone-600">
              {goal.title}
            </li>
          ))}
        </ul>
      )}
      {/* One entry only — the goal view itself handles both adding and viewing. */}
      <div className="mt-2">
        <button
          type="button"
          onClick={onOpenGoalView}
          className="rounded bg-amber-500 px-2 py-0.5 text-white transition-colors hover:bg-amber-600"
        >
          目标设置
        </button>
      </div>
    </section>
  );
}
