/**
 * Purpose: orchestrates one chat round's full real pipeline — knowledge-tree extraction,
 * edge-judge, interest extraction, in that order, matching the app bus's event chain
 * (knowledge:nodesExtracted fires edge-judge and interest in parallel; the harness runs them
 * sequentially instead, a deliberate simplification since simlab has no event bus).
 * Main exports: runRoundPipeline, RoundPipelineResult (re-exports pipeline stage types).
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { RejectedCyclicEdge } from "@breadcrumb/plugin-graph";
import { runEdgeJudgeStage } from "./edgeJudgeStage";
import { runInterestStage } from "./interestStage";
import { runKnowledgeTreeStage } from "./knowledgeTreeStage";
import type { PipelineFailure, RoundPipelineInput, SightedNode } from "./pipelineTypes";

export type {
  PipelineFailure,
  PipelinePurpose,
  RoundPipelineInput,
  SightedNode,
} from "./pipelineTypes";

export interface RoundPipelineResult {
  newNodes: KnowledgeNodeRow[];
  sightings: SightedNode[];
  addedEdges: KnowledgeEdgeRow[];
  rejectedCyclicEdges: RejectedCyclicEdge[];
  failures: PipelineFailure[];
}

export async function runRoundPipeline(input: RoundPipelineInput): Promise<RoundPipelineResult> {
  const failures: PipelineFailure[] = [];

  const treeResult = await runKnowledgeTreeStage(input, failures);
  const edgeResult = await runEdgeJudgeStage(input, treeResult.newNodes, failures);
  await runInterestStage(input, treeResult.newNodes, treeResult.sightings, failures);

  return {
    // Method nodes proposed by the edge judge (e.g. "费曼技巧") are genuinely new tree nodes
    // too — included here so every "new nodes this round" consumer (day digest, metrics
    // newNodeCount) counts them, not just the knowledge-tree stage's own extractions (S5).
    newNodes: [...treeResult.newNodes, ...edgeResult.methodNodes],
    sightings: treeResult.sightings,
    addedEdges: edgeResult.addedEdges,
    rejectedCyclicEdges: edgeResult.rejectedCyclicEdges,
    failures,
  };
}
