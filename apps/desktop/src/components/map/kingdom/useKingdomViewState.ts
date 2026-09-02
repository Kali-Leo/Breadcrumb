/**
 * Purpose: the kingdom view's own state — selection, hover, the relations switch, the
 * in-flight guard, the manual collapse sets (persisted per kingdom), the last-seen dates and
 * origin footprints loaded in one sightings pass, and this region's mirror sources.
 * Main exports: KingdomRef, KingdomViewState, useKingdomViewState.
 */
import { useEffect, useState } from "react";
import {
  loadRegionFeedbackSources,
  type RegionFeedbackSources,
} from "../../../lib/feedback/regionFeedbackData";
import {
  kingdomCollapseKey,
  type LastSeenSighting,
  loadKingdomPersistedState,
} from "../../../lib/map/kingdomPersistence";

export interface KingdomRef {
  nodeId: string;
  label: string;
  memberNodeIds: readonly string[];
}

export interface KingdomViewState {
  collapseKey: string;
  selectedId: string | null;
  setSelectedId(nodeId: string | null): void;
  hoverId: string | null;
  setHoverId(nodeId: string | null): void;
  showAllEdges: boolean;
  setShowAllEdges(value: boolean): void;
  opening: boolean;
  setOpening(value: boolean): void;
  manualCollapsed: ReadonlySet<string>;
  manualExpanded: ReadonlySet<string>;
  setManual(collapsed: ReadonlySet<string>, expanded: ReadonlySet<string>): void;
  lastSeenByNode: ReadonlyMap<string, LastSeenSighting>;
  /** Concepts with a surviving message behind them — the only ones the "back to where this
   * was learned" link can be offered for. */
  originNodeIds: ReadonlySet<string>;
  feedbackSources: RegionFeedbackSources | null;
}

export function useKingdomViewState(kingdom: KingdomRef): KingdomViewState {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showAllEdges, setShowAllEdges] = useState(false);
  const [opening, setOpening] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [manualExpanded, setManualExpanded] = useState<ReadonlySet<string>>(new Set());
  const [lastSeenByNode, setLastSeenByNode] = useState<ReadonlyMap<string, LastSeenSighting>>(
    new Map(),
  );
  const [originNodeIds, setOriginNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [feedbackSources, setFeedbackSources] = useState<RegionFeedbackSources | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadRegionFeedbackSources().then((data) => {
      if (!cancelled) setFeedbackSources(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const collapseKey = kingdomCollapseKey(kingdom.nodeId);

  useEffect(() => {
    void (async () => {
      const stored = await loadKingdomPersistedState(collapseKey, kingdom.memberNodeIds);
      if (stored.manual !== null) {
        setManualCollapsed(stored.manual.collapsed);
        setManualExpanded(stored.manual.expanded);
      }
      setLastSeenByNode(stored.lastSeenByNode);
      setOriginNodeIds(stored.originNodeIds);
    })();
  }, [collapseKey, kingdom.memberNodeIds]);

  return {
    collapseKey,
    selectedId,
    setSelectedId,
    hoverId,
    setHoverId,
    showAllEdges,
    setShowAllEdges,
    opening,
    setOpening,
    manualCollapsed,
    manualExpanded,
    setManual(collapsed, expanded) {
      setManualCollapsed(collapsed);
      setManualExpanded(expanded);
    },
    lastSeenByNode,
    originNodeIds,
    feedbackSources,
  };
}
