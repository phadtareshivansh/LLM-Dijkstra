import { Edge, Node } from '../data/themeConstants';
import { buildAccessibleAdjacencyMap, getNodeIds } from './graphUtils';
import { RoutingResult, SoftAvoidanceConfig, UNREACHABLE_ERROR } from './routingEngine';

const DEFAULT_SOFT_PENALTY = 100;

interface FrontierState {
  distanceByNode: Map<string, number>;
  previousByNode: Map<string, string>;
  settled: Set<string>;
  unvisited: Set<string>;
}

function createFrontier(nodes: Node[], avoidSet: Set<string>, start: string): FrontierState {
  const unvisited = new Set<string>();

  for (const node of nodes) {
    if (!avoidSet.has(node.name)) {
      unvisited.add(node.name);
    }
  }

  return {
    distanceByNode: new Map([[start, 0]]),
    previousByNode: new Map(),
    settled: new Set(),
    unvisited,
  };
}

function takeClosest(frontier: FrontierState): { nodeName: string; distance: number } | null {
  let bestNode: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of frontier.unvisited) {
    const candidateDistance = frontier.distanceByNode.get(candidate) ?? Number.POSITIVE_INFINITY;

    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestNode = candidate;
    }
  }

  if (bestNode === null || bestDistance === Number.POSITIVE_INFINITY) {
    return null;
  }

  frontier.unvisited.delete(bestNode);
  frontier.settled.add(bestNode);

  return { nodeName: bestNode, distance: bestDistance };
}

function relaxEdges(
  frontier: FrontierState,
  adjacency: Map<string, { nodeName: string; weight: number }[]>,
  currentNode: string,
  currentDistance: number,
  avoidSet: Set<string>,
  softAvoidSet: Set<string>,
  penalty: number
): void {
  for (const neighbor of adjacency.get(currentNode) ?? []) {
    if (avoidSet.has(neighbor.nodeName)) {
      continue;
    }

    if (!frontier.unvisited.has(neighbor.nodeName)) {
      continue;
    }

    let nextDistance = currentDistance + neighbor.weight;

    if (softAvoidSet.has(neighbor.nodeName) || softAvoidSet.has(currentNode)) {
      nextDistance += penalty;
    }

    const knownDistance = frontier.distanceByNode.get(neighbor.nodeName) ?? Number.POSITIVE_INFINITY;

    if (nextDistance < knownDistance) {
      frontier.distanceByNode.set(neighbor.nodeName, nextDistance);
      frontier.previousByNode.set(neighbor.nodeName, currentNode);
    }
  }
}

function reconstructMeetingPath(
  forward: FrontierState,
  backward: FrontierState,
  meetingNode: string,
  start: string,
  end: string
): string[] {
  const forwardPath: string[] = [];
  let current: string | undefined = meetingNode;

  while (current) {
    forwardPath.unshift(current);

    if (current === start) {
      break;
    }

    current = forward.previousByNode.get(current);
  }

  const backwardPath: string[] = [];
  current = backward.previousByNode.get(meetingNode);

  while (current) {
    backwardPath.push(current);

    if (current === end) {
      break;
    }

    current = backward.previousByNode.get(current);
  }

  return [...forwardPath, ...backwardPath];
}

/**
 * Bidirectional Dijkstra shortest path.
 *
 * Expands frontiers from the start and end in alternation, preferring the
 * smaller frontier, and returns as soon as the two fronts meet. The result is
 * identical to plain Dijkstra but explores far fewer nodes on large graphs.
 */
export function bidirectionalShortestPath(
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

  const forward = createFrontier(nodes, avoidSet, start);
  const backward = createFrontier(nodes, avoidSet, end);
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestMeetingNode: string | null = null;
  let expandForward = true;
  let forwardExhausted = false;
  let backwardExhausted = false;
  let expandedNodes = 0;

  while (
    forward.unvisited.size > 0 &&
    backward.unvisited.size > 0 &&
    !(forwardExhausted && backwardExhausted)
  ) {
    const current = expandForward ? takeClosest(forward) : takeClosest(backward);

    if (current === null) {
      if (expandForward) {
        forwardExhausted = true;
      } else {
        backwardExhausted = true;
      }

      expandForward = !expandForward;
      continue;
    }

    if (bestMeetingNode !== null && current.distance >= bestDistance) {
      break;
    }

    const frontier = expandForward ? forward : backward;
    const opposite = expandForward ? backward : forward;
    expandedNodes += 1;

    relaxEdges(frontier, adjacency, current.nodeName, current.distance, avoidSet, softAvoidSet, penalty);
    expandForward = !expandForward;

    if (opposite.settled.has(current.nodeName)) {
      const combined =
        (forward.distanceByNode.get(current.nodeName) ?? Number.POSITIVE_INFINITY) +
        (backward.distanceByNode.get(current.nodeName) ?? Number.POSITIVE_INFINITY);

      if (combined < bestDistance) {
        bestDistance = combined;
        bestMeetingNode = current.nodeName;
      }
    }
  }

  if (bestMeetingNode === null || bestDistance === Number.POSITIVE_INFINITY) {
    return {
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: UNREACHABLE_ERROR,
      stats: { expandedNodes },
    };
  }

  return {
    path: reconstructMeetingPath(forward, backward, bestMeetingNode, start, end),
    distance: bestDistance,
    stats: { expandedNodes },
  };
}