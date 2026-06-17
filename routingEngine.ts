import { Edge, Node } from './themeConstants';

export interface RoutingResult {
  path: string[];
  distance: number;
  error?: string;
}

const UNREACHABLE_ERROR = 'Destination is unreachable with the current navigation constraints.';

interface Neighbor {
  nodeName: string;
  weight: number;
}

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

function buildAdjacencyMap(nodes: Node[], edges: Edge[]): Map<string, Neighbor[]> {
  const adjacency = new Map<string, Neighbor[]>();

  for (const node of nodes) {
    adjacency.set(node.name, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.push({ nodeName: edge.to, weight: edge.weight });
    adjacency.get(edge.to)?.push({ nodeName: edge.from, weight: edge.weight });
  }

  return adjacency;
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
  const adjacency = buildAdjacencyMap(nodes, edges);

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

    if (!avoidSet.has(node.name)) {
      unvisited.add(node.name);
    }
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

    for (const neighbor of adjacency.get(currentNode) ?? []) {
      if (avoidSet.has(neighbor.nodeName)) {
        continue;
      }

      if (!unvisited.has(neighbor.nodeName)) {
        continue;
      }

      const nextDistance = currentDistance + neighbor.weight;
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
  };
}
