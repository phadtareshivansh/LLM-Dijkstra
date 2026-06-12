import { Edge, Node } from './themeConstants';

export interface RoutingResult {
  path: string[];
  distance: number;
  error?: string;
}

const UNREACHABLE_ERROR = 'Destination is unreachable with the current navigation constraints.';

function getNodeIds(nodes: Node[]): Set<string> {
  return new Set(nodes.map((node) => node.name));
}

function reconstructPath(previousByNode: Map<string, string>, end: string): string[] {
  const path: string[] = [];
  let current: string | undefined = end;

  while (current) {
    path.unshift(current);
    current = previousByNode.get(current);
  }

  return path;
}

export function dijkstraShortestPath(
  nodes: Node[],
  edges: Edge[],
  start: string,
  end: string,
  avoidNodes: string[] = []
): RoutingResult {
  const nodeIds = getNodeIds(nodes);
  const avoidSet = new Set(avoidNodes);

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

  if (avoidSet.has(start) || avoidSet.has(end)) {
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
    unvisited.add(node.name);
  }

  distanceByNode.set(start, 0);

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

    if (currentNode === end) {
      const path = reconstructPath(previousByNode, end);
      return {
        path,
        distance: currentDistance,
      };
    }

    for (const edge of edges) {
      if (edge.from !== currentNode) {
        continue;
      }

      if (avoidSet.has(edge.to)) {
        continue;
      }

      if (!unvisited.has(edge.to)) {
        continue;
      }

      const nextDistance = currentDistance + edge.weight;
      const knownDistance = distanceByNode.get(edge.to) ?? Number.POSITIVE_INFINITY;

      if (nextDistance < knownDistance) {
        distanceByNode.set(edge.to, nextDistance);
        previousByNode.set(edge.to, currentNode);
      }
    }
  }

  return {
    path: [],
    distance: Number.POSITIVE_INFINITY,
    error: UNREACHABLE_ERROR,
  };
}
