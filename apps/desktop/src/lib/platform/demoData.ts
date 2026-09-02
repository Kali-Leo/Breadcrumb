/**
 * Purpose: installs and removes the guided tour's demo learner.
 *
 * A newcomer's first screen used to be an empty map, an empty heatmap and three flat trend
 * lines — the product explaining itself with nothing to point at. Every powerful tool with a
 * learning curve solves this the same way (Notion's starter workspace, Figma's example files,
 * Pipedrive's sample pipeline): show it working first, on data that is obviously not yours.
 *
 * The demo is a real learner's three months: 24 concepts across astronomy and JavaScript,
 * with sighting histories checked against the real FSRS curve so the map genuinely has bright
 * regions, faded ones and things waiting to be reviewed. It goes into the same tables real
 * data goes into, because anything else would be a mock-up that drifts.
 *
 * Every row it writes carries a `demo-` id, and removal deletes those plus anything the app
 * derived from them. It never touches a row the learner made.
 *
 * Main exports: installDemoData, removeDemoData, hasDemoData.
 */
import { insertDemoData, wipeDemoData } from "@breadcrumb/demo-seed";
import { getSqlClient } from "./db";

/** One demo node id is enough to answer "is the demo installed" without a schema flag that
 * could disagree with the rows themselves. */
export async function hasDemoData(): Promise<boolean> {
  const sql = await getSqlClient();
  const rows = await sql.select<{ count: number }>(
    "SELECT COUNT(*) AS count FROM knowledge_nodes WHERE id LIKE 'demo-%'",
    [],
  );
  return (rows[0]?.count ?? 0) > 0;
}

/** Writes the demo learner. Idempotent — the seed replaces any previous copy of itself.
 *
 * The bundled Chinese-English pack is 3.3 MB and is only ever read here, so it is fetched at
 * the moment someone asks for the demo rather than sitting behind every mention of this
 * module — asking "is the demo installed?" must not download a dictionary. */
export async function installDemoData(): Promise<void> {
  const sql = await getSqlClient();
  const languagePack = (await import("../../assets/language-packs/zh-en.json")).default;
  await insertDemoData(sql, new Date(), { languagePack });
}

/** Removes every demo row and everything the app derived from one. */
export async function removeDemoData(): Promise<void> {
  const sql = await getSqlClient();
  await wipeDemoData(sql);
}
