/**
 * Purpose: row types for the spec 036 research-task tables — run bookkeeping
 * (research_task_runs) and the user-visible results (research_results, physically deletable).
 * Main exports: ResearchTaskRunRow, ResearchResultRow.
 */
export interface ResearchTaskRunRow {
  task_id: string;
  ran_at: string;
}

export interface ResearchResultRow {
  id: string;
  task_id: string;
  institution: string;
  title: string;
  purpose: string;
  ethics_note: string | null;
  display_json: string;
  results_json: string;
  computed_at: string;
}
