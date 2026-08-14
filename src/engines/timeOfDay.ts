import { Edge, NIGHT_CLOSED_TAG, STAIRS_TAG } from '../data/themeConstants';

export type TimeOfDay = 'off-peak' | 'peak' | 'night';

const PEAK_MULTIPLIER = 1.6;
const PEAK_STAIRS_MULTIPLIER = 4;

function scaleWeight(weight: number, multiplier: number): number {
  return Number((weight * multiplier).toFixed(1));
}

/**
 * Returns a modified edge list for the given time of day.
 *
 * - `off-peak`: edges are unchanged.
 * - `peak`: every edge gets heavier (1.6x) and narrow stairs-scale routes
 *   get heavier still (2.5x), so the optimal path can change.
 * - `night`: edges tagged `night-closed` are removed (venues shut).
 */
export function applyTimeOfDayEdges(edges: Edge[], timeOfDay: TimeOfDay): Edge[] {
  if (timeOfDay === 'off-peak') {
    return edges;
  }

  if (timeOfDay === 'night') {
    return edges.filter((edge) => !edge.tags?.includes(NIGHT_CLOSED_TAG));
  }

  return edges.map((edge) => {
    const multiplier = edge.tags?.includes(STAIRS_TAG) ? PEAK_STAIRS_MULTIPLIER : PEAK_MULTIPLIER;

    return { ...edge, weight: scaleWeight(edge.weight, multiplier) };
  });
}