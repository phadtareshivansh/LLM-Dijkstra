import { Edge, Node } from './themeConstants';
import {
  buildAccessibleAdjacencyMap,
  euclideanDistance,
  getNodeIds,
  reconstructPath,
} from './graphUtils';
import { RoutingResult, SoftAvoidanceConfig, UNREACHABLE_ERROR } from './routingEngine';

const DEFAULT_SOFT_PENALTY = 100;

function computeMaxSpanPerWeight(nodes: Node[], edges: Edge[]): number {
  const nodeLookup = new Map(nodes.map((node) => [node.name, node]));
  let maxSpanPerWeight = 1;

  for (const edge of edges) {
    const from = nodeLookup.get(edge.from);
    const to = nodeLookup.get(edge.to);

    if (!from || !to) {
      continue;
    }

    const span = euclideanDistance(from, to);
    maxSpanPerWeight = Math.max(maxSpanPerWeight, span / edge.weight);
  }

  return maxSpanPerWeight;
}

/**
 * A* shortest path with an admissible Euclidean heuristic.
 *
 * The heuristic is scaled by the largest coordinate span covered per unit of
 * edge weight, which guarantees it never overestimates the true cost even
 * when edge weights are not proportional to distances. With such weights A*
 * behaves like Dijkstra; with metric weights it expands far fewer nodes.
 */
export function astarShortestPath(
  nodes: Node[],
  edges: Edge[],
  start: string,
  end: string,
  avoidNodes: string[] = [],
  softAvoidance?: SoftAvoidanceConfig,
  accessibleOnly = false
): RoutingResult {
  const nodeIds = getNodeIds(nodes);
  const softAvoidSet = softAvoidance ? new Set(avoidNodes) : new Set<string>();
  const avoidSet = softAvoidance ? new Set<string>() : new Set(avoidNodes);
  const penalty = softAvoidance?.penalty ?? DEFAULT_SOFT_PENALTY;
  const adjacency = buildAccessibleAdjacencyMap(nodes, edges, accessibleOnly);
  const nodeLookup = new Map(nodes.map((node) => [node.name, node]));
  const goalNode = nodeLookup.get(end);
  const maxSpanPerWeight = computeMaxSpanPerWeight(nodes, edges);

  if (!nodeIds.has(start)) {
    return {
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: `Start node "${start}" does not exist in the graph.`,
    };
  }

  if (!nodeIds.has(end)) {
    return {
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: `End node "${end}" does not exist in the graph.`,
    };
  }

  if (avoidSet.has(start) || avoidSet.has(end) || softAvoidSet.has(start) || softAvoidSet.has(end)) {
    return {
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: UNREACHABLE_ERROR,
    };
  }

  if (start === end) {
    return { path: [start], distance: 0 };
  }

  const heuristic = (nodeName: string): number => {
    const node = nodeLookup.get(nodeName);

    if (!node || !goalNode) {
      return 0;
    }

    return euclideanDistance(node, goalNode) / maxSpanPerWeight;
  };

  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[start, 0]]);
  const openSet = new Map<string, OpenEntry>();
  openSet.set(start, { nodeName: start, estimate: heuristic(start) });

  while (openSet.size > 0) {
    let bestNode: string | null = null;
    let bestEstimate = Number.POSITIVE_INFINITY;

    for (const entry of openSet.values()) {
      if (entry.estimate < bestEstimate) {
        bestEstimate = entry.estimate;
        bestNode = entry.nodeName;
      }
    }

    if (bestNode === null) {
      break;
    }

    openSet.delete(bestNode);

    if (bestNode === end) {
      return {
        path: reconstructPath(cameFrom, end),
        distance: gScore.get(end) ?? Number.POSITIVE_INFINITY,
      };
    }

    const currentG = gScore.get(bestNode) ?? Number.POSITIVE_INFINITY;

    for (const neighbor of adjacency.get(bestNode) ?? []) {
      if (avoidSet.has(neighbor.nodeName)) {
        continue;
      }

      let tentativeG = currentG + neighbor.weight;

      if (softAvoidSet.has(neighbor.nodeName) || softAvoidSet.has(bestNode)) {
        tentativeG += penalty;
      }

      const knownG = gScore.get(neighbor.nodeName) ?? Number.POSITIVE_INFINITY;

      if (tentativeG < knownG) {
        cameFrom.set(neighbor.nodeName, bestNode);
        gScore.set(neighbor.nodeName, tentativeG);
        openSet.set(neighbor.nodeName, {
          nodeName: neighbor.nodeName,
          estimate: tentativeG + heuristic(neighbor.nodeName),
        });
      }
    }
  }

  return {
    path: [],
    distance: Number.POSITIVE_INFINITY,
    error: UNREACHABLE_ERROR,
  };
}

interface OpenEntry {
  nodeName: string;
  estimate: number;
}