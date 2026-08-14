import { Edge, Node } from './themeConstants';
import {
  buildAccessibleAdjacencyMap,
  getNodeIds,
  reconstructPath,
} from './graphUtils';

export interface SearchStats {
  expandedNodes: number;
}

export interface RoutingResult {
  path: string[];
  distance: number;
  error?: string;
  segments?: RoutingResult[];
  stats?: SearchStats;
}

export const UNREACHABLE_ERROR = 'Destination is unreachable with the current navigation constraints.';

export interface SoftAvoidanceConfig {
  penalty: number;
}

export type Algorithm = 'dijkstra' | 'astar' | 'bidirectional';

export type SearchFunction = (
  nodes: Node[],
  edges: Edge[],
  start: string,
  end: string,
  avoidNodes: string[],
  softAvoidance?: SoftAvoidanceConfig,
  accessibleOnly?: boolean
) => RoutingResult;

const DEFAULT_SOFT_PENALTY = 100;

export function dijkstraShortestPath(
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

  const distanceByNode = new Map<string, number>();
  const previousByNode = new Map<string, string>();
  const unvisited = new Set<string>();

  for (const node of nodes) {
    distanceByNode.set(node.name, Number.POSITIVE_INFINITY);

    if (!avoidSet.has(node.name)) {
      unvisited.add(node.name);
    }
  }

  distanceByNode.set(start, 0);

  let expandedNodes = 0;

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
    expandedNodes += 1;

    if (currentNode === end) {
      const path = reconstructPath(previousByNode, end);
      return {
        path,
        distance: currentDistance,
        stats: { expandedNodes },
      };
    }

    for (const neighbor of adjacency.get(currentNode) ?? []) {
      if (avoidSet.has(neighbor.nodeName)) {
        continue;
      }

      if (!unvisited.has(neighbor.nodeName)) {
        continue;
      }

      let nextDistance = currentDistance + neighbor.weight;

      if (softAvoidSet.has(neighbor.nodeName) || softAvoidSet.has(currentNode)) {
        nextDistance += penalty;
      }

      const knownDistance = distanceByNode.get(neighbor.nodeName) ?? Number.POSITIVE_INFINITY;

      if (nextDistance < knownDistance) {
        distanceByNode.set(neighbor.nodeName, nextDistance);
        previousByNode.set(neighbor.nodeName, currentNode);
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

export function dijkstraShortestPathWithWaypoints(
  nodes: Node[],
  edges: Edge[],
  start: string,
  waypoints: string[],
  end: string,
  avoidNodes: string[] = [],
  softAvoidance?: SoftAvoidanceConfig,
  accessibleOnly = false,
  search: SearchFunction = dijkstraShortestPath
): RoutingResult {
  const allPoints = [start, ...waypoints, end];
  const segments: RoutingResult[] = [];
  let totalDistance = 0;
  let combinedPath: string[] = [];

  for (let index = 0; index < allPoints.length - 1; index += 1) {
    const segmentStart = allPoints[index];
    const segmentEnd = allPoints[index + 1];

    const segmentResult = search(nodes, edges, segmentStart, segmentEnd, avoidNodes, softAvoidance, accessibleOnly);

    if (segmentResult.error) {
      return {
        path: [],
        distance: Number.POSITIVE_INFINITY,
        error: segmentResult.error,
        segments,
      };
    }

    segments.push(segmentResult);
    totalDistance += segmentResult.distance;

    if (index === 0) {
      combinedPath = [...segmentResult.path];
    } else {
      combinedPath = [...combinedPath, ...segmentResult.path.slice(1)];
    }
  }

  return {
    path: combinedPath,
    distance: totalDistance,
    segments,
  };
}

export interface TraceRelaxation {
  from: string;
  to: string;
  proposedDistance: number;
  improved: boolean;
}

export interface DijkstraTraceStep {
  step: number;
  settledNode: string | null;
  settledDistance: number;
  relaxations: TraceRelaxation[];
  distanceByNode: ReadonlyMap<string, number>;
  previousByNode: ReadonlyMap<string, string>;
  finished: boolean;
}

export interface DijkstraTraceResult {
  steps: DijkstraTraceStep[];
  path: string[];
  distance: number;
  error?: string;
}

export function dijkstraTrace(
  nodes: Node[],
  edges: Edge[],
  start: string,
  end: string,
  avoidNodes: string[] = []
): DijkstraTraceResult {
  const nodeIds = getNodeIds(nodes);
  const avoidSet = new Set(avoidNodes);
  const adjacency = buildAccessibleAdjacencyMap(nodes, edges, false);

  if (!nodeIds.has(start)) {
    return {
      steps: [],
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: `Start node "${start}" does not exist in the graph.`,
    };
  }

  if (!nodeIds.has(end)) {
    return {
      steps: [],
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: `End node "${end}" does not exist in the graph.`,
    };
  }

  if (avoidSet.has(start) || avoidSet.has(end)) {
    return {
      steps: [],
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: UNREACHABLE_ERROR,
    };
  }

  const distanceByNode = new Map<string, number>();
  const previousByNode = new Map<string, string>();
  const unvisited = new Set<string>();

  for (const node of nodes) {
    distanceByNode.set(node.name, Number.POSITIVE_INFINITY);

    if (!avoidSet.has(node.name)) {
      unvisited.add(node.name);
    }
  }

  distanceByNode.set(start, 0);

  const steps: DijkstraTraceStep[] = [];
  let stepIndex = 0;

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

    const relaxations: TraceRelaxation[] = [];

    for (const neighbor of adjacency.get(currentNode) ?? []) {
      if (avoidSet.has(neighbor.nodeName)) {
        continue;
      }

      const proposedDistance = currentDistance + neighbor.weight;
      const knownDistance = distanceByNode.get(neighbor.nodeName) ?? Number.POSITIVE_INFINITY;
      const improved = proposedDistance < knownDistance;

      if (improved) {
        distanceByNode.set(neighbor.nodeName, proposedDistance);
        previousByNode.set(neighbor.nodeName, currentNode);
      }

      relaxations.push({
        from: currentNode,
        to: neighbor.nodeName,
        proposedDistance,
        improved,
      });
    }

    const finished = currentNode === end;

    steps.push({
      step: stepIndex,
      settledNode: currentNode,
      settledDistance: currentDistance,
      relaxations,
      distanceByNode: new Map(distanceByNode),
      previousByNode: new Map(previousByNode),
      finished,
    });

    stepIndex += 1;

    if (finished) {
      break;
    }
  }

  const lastStep = steps[steps.length - 1];

  if (!lastStep || lastStep.settledNode !== end) {
    return {
      steps,
      path: [],
      distance: Number.POSITIVE_INFINITY,
      error: UNREACHABLE_ERROR,
    };
  }

  const path = reconstructPath(lastStep.previousByNode, end);

  return {
    steps,
    path,
    distance: lastStep.settledDistance,
  };
}
