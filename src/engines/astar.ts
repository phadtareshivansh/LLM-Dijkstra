import { Edge, Node, ACCESSIBLE_TAG } from '../data/themeConstants';
import { buildAccessibleAdjacencyMap, euclideanDistance, getNodeIds, reconstructPath } from './graphUtils';
import { DEFAULT_SOFT_PENALTY, RoutingResult, SoftAvoidanceConfig, UNREACHABLE_ERROR } from './routingEngine';

function landmarkDistances(nodes: Node[], edges: Edge[], landmark: string, avoidSet: Set<string>): Map<string, number> {
  const distanceByNode = new Map<string, number>([[landmark, 0]]);
  const unvisited = new Set<string>();

  for (const node of nodes) {
    if (node.name !== landmark) {
      distanceByNode.set(node.name, Number.POSITIVE_INFINITY);
    }

    if (!avoidSet.has(node.name)) {
      unvisited.add(node.name);
    }
  }

  while (unvisited.size > 0) {
    let currentNode: string | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const candidate of unvisited) {
      const candidateDistance = distanceByNode.get(candidate) ?? Number.POSITIVE_INFINITY;

      if (candidateDistance < currentDistance) {
        currentDistance = candidateDistance;
        currentNode = candidate;
      }
    }

    if (currentNode === undefined || currentDistance === Number.POSITIVE_INFINITY) {
      break;
    }

    unvisited.delete(currentNode);

    for (const edge of edges) {
      if (edge.from === currentNode) {
        if (avoidSet.has(edge.to)) {
          continue;
        }

        const nextDistance = currentDistance + edge.weight;
        const knownDistance = distanceByNode.get(edge.to) ?? Number.POSITIVE_INFINITY;

        if (nextDistance < knownDistance) {
          distanceByNode.set(edge.to, nextDistance);
        }
      } else if (edge.to === currentNode) {
        if (avoidSet.has(edge.from)) {
          continue;
        }

        const nextDistance = currentDistance + edge.weight;
        const knownDistance = distanceByNode.get(edge.from) ?? Number.POSITIVE_INFINITY;

        if (nextDistance < knownDistance) {
          distanceByNode.set(edge.from, nextDistance);
        }
      }
    }
  }

  return distanceByNode;
}

function selectLandmarks(nodes: Node[]): [Node, Node] {
  let first = nodes[0];
  let second = nodes[1] ?? nodes[0];
  let farthest = -1;

  for (const nodeA of nodes) {
    for (const nodeB of nodes) {
      const span = euclideanDistance(nodeA, nodeB);

      if (span > farthest) {
        farthest = span;
        first = nodeA;
        second = nodeB;
      }
    }
  }

  return [first, second];
}

/**
 * A* shortest path with landmark-based (ALT) lower bounds.
 *
 * The two farthest-apart nodes act as landmarks. Reverse Dijkstra from each
 * landmark yields distances d(L, n); the triangle inequality guarantees
 * h(n) = max(|d(L, n) - d(L, goal)|) never overestimates the true remaining
 * cost. The heuristic is consistent, so A* expands at most the nodes that
 * plain Dijkstra would, and usually far fewer.
 */
export function astarShortestPath(
  nodes: Node[],
  edges: Edge[],
  start: string,
  end: string,
  avoidNodes: string[] = [],
  softAvoidance?: SoftAvoidanceConfig,
  accessibleOnly = false,
  hardAvoidNodes?: string[]
): RoutingResult {
  const nodeIds = getNodeIds(nodes);
  const softAvoidSet = softAvoidance ? new Set(avoidNodes) : new Set<string>();
  const hardAvoidSet = new Set(hardAvoidNodes ?? (softAvoidance ? [] : avoidNodes));
  const penalty = softAvoidance?.penalty ?? DEFAULT_SOFT_PENALTY;
  const adjacency = buildAccessibleAdjacencyMap(nodes, edges, accessibleOnly);

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

  if (hardAvoidSet.has(start) || hardAvoidSet.has(end) || softAvoidSet.has(start) || softAvoidSet.has(end)) {
    return {
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: UNREACHABLE_ERROR,
    };
  }

  if (start === end) {
    return { path: [start], distance: 0, stats: { expandedNodes: 0 } };
  }

  const heuristicEdges = accessibleOnly
    ? edges.filter((edge) => edge.tags?.includes(ACCESSIBLE_TAG))
    : edges;
  const [landmarkA, landmarkB] = selectLandmarks(nodes);
  const distanceFromA = landmarkDistances(nodes, heuristicEdges, landmarkA.name, hardAvoidSet);
  const distanceFromB = landmarkDistances(nodes, heuristicEdges, landmarkB.name, hardAvoidSet);

  const heuristic = (nodeName: string): number => {
    const goalDistanceA = distanceFromA.get(end);
    const goalDistanceB = distanceFromB.get(end);
    let best = 0;

    for (const [nodeDistance, goalDistance] of [
      [distanceFromA.get(nodeName), goalDistanceA],
      [distanceFromB.get(nodeName), goalDistanceB],
    ] as const) {
      if (nodeDistance !== undefined && goalDistance !== undefined && Number.isFinite(nodeDistance) && Number.isFinite(goalDistance)) {
        best = Math.max(best, Math.abs(nodeDistance - goalDistance));
      }
    }

    return best;
  };

  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[start, 0]]);
  const openSet = new Map<string, OpenEntry>();
  openSet.set(start, { nodeName: start, estimate: heuristic(start) });

  let expandedNodes = 0;

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
    expandedNodes += 1;

    if (bestNode === end) {
      return {
        path: reconstructPath(cameFrom, end),
        distance: gScore.get(end) ?? Number.POSITIVE_INFINITY,
        stats: { expandedNodes },
      };
    }

    const currentG = gScore.get(bestNode) ?? Number.POSITIVE_INFINITY;

    for (const neighbor of adjacency.get(bestNode) ?? []) {
      if (hardAvoidSet.has(neighbor.nodeName)) {
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
    stats: { expandedNodes },
  };
}

interface OpenEntry {
  nodeName: string;
  estimate: number;
}