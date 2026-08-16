/**
 * Purpose: the palace context stack's goal card (spec 047) — with goals it lists them and
 * opens the goal view; without goals it is one quiet invitation. No progress fractions, no
 * denominators (ladder rule: assessment is never displayed as a mechanism).
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
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={onOpenGoalView}
          className="rounded bg-amber-500 px-2 py-0.5 text-white transition-colors hover:bg-amber-600"
        >
          ＋ 添加目标
        </button>
        {goals.length > 0 && (
          <button
            type="button"
            onClick={onOpenGoalView}
            className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
          >
            查看目标详情
          </button>
        )}
      </div>
    </section>
  );
}
