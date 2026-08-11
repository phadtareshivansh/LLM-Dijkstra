import { Edge } from './themeConstants';
import { buildEdgeWeightMap } from './graphUtils';
import { getDisplayLabel } from './nodeLabels';

export interface NavigationLeg {
  index: number;
  from: string;
  to: string;
  distance: number;
  cumulativeDistance: number;
}

/**
 * Splits a route path into leg-by-leg instructions, one leg per graph edge
 * traversed, with the edge weight and the cumulative distance so far.
 */
export function buildDirections(path: string[], edges: Edge[]): NavigationLeg[] {
  const weightMap = buildEdgeWeightMap(edges);

  if (path.length < 2) {
    return [];
  }

  let cumulativeDistance = 0;

  return path.slice(0, -1).map((from, index) => {
    const to = path[index + 1];
    const weight = weightMap.get(`${from}->${to}`);

    if (weight === undefined) {
      throw new Error(`Edge from "${from}" to "${to}" does not exist in the graph.`);
    }

    cumulativeDistance += weight;

    return {
      index,
      from,
      to,
      distance: weight,
      cumulativeDistance,
    };
  });
}

/**
 * Formats a leg as plain English, e.g.
 * "1. Head from Main Gate to Auditorium (1 unit)."
 */
export function formatDirectionText(leg: NavigationLeg): string {
  const distanceLabel = `${leg.distance} unit${leg.distance === 1 ? '' : 's'}`;
  const fromLabel = getDisplayLabel(leg.from);
  const toLabel = getDisplayLabel(leg.to);

  return `${leg.index + 1}. Head from ${fromLabel} to ${toLabel} (${distanceLabel}).`;
}