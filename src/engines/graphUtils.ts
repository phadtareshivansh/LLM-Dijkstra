import { ACCESSIBLE_TAG, Edge, Node } from '../data/themeConstants';

export interface Neighbor {
  nodeName: string;
  weight: number;
}

export function buildEdgeWeightMap(edges: Edge[]): Map<string, number> {
  const weightMap = new Map<string, number>();

  for (const edge of edges) {
    const known = weightMap.get(`${edge.from}->${edge.to}`);

    if (known === undefined || edge.weight < known) {
      weightMap.set(`${edge.from}->${edge.to}`, edge.weight);
      weightMap.set(`${edge.to}->${edge.from}`, edge.weight);
    }
  }

  return weightMap;
}

export function pathDistance(path: string[], edges: Edge[]): number {
  const weightMap = buildEdgeWeightMap(edges);
  let totalDistance = 0;

  for (let index = 0; index < path.length - 1; index += 1) {
    const weight = weightMap.get(`${path[index]}->${path[index + 1]}`);

    if (weight === undefined) {
      return Number.POSITIVE_INFINITY;
    }

    totalDistance += weight;
  }

  return totalDistance;
}

export function pathCost(
  path: string[],
  edges: Edge[],
  softAvoidNodes: string[] = [],
  penalty = 0
): number {
  const softAvoidSet = new Set(softAvoidNodes);
  const weightByPair = new Map<string, number>();

  for (const edge of edges) {
    const first = `${edge.from}->${edge.to}`;
    const second = `${edge.to}->${edge.from}`;
    const known = weightByPair.get(first);

    if (known === undefined || edge.weight < known) {
      weightByPair.set(first, edge.weight);
      weightByPair.set(second, edge.weight);
    }
  }

  let totalCost = 0;

  for (let index = 0; index < path.length - 1; index += 1) {
    const weight = weightByPair.get(`${path[index]}->${path[index + 1]}`);

    if (weight === undefined) {
      return Number.POSITIVE_INFINITY;
    }

    totalCost += weight;

    if (penalty > 0 && (softAvoidSet.has(path[index]) || softAvoidSet.has(path[index + 1]))) {
      totalCost += penalty;
    }
  }

  return totalCost;
}

export function getNodeIds(nodes: Node[]): Set<string> {
  return new Set(nodes.map((node) => node.name));
}

export function reconstructPath(previousByNode: ReadonlyMap<string, string>, end: string): string[] {
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

function isAccessibleEdge(edge: Edge, accessibleOnly: boolean): boolean {
  return !accessibleOnly || (edge.tags?.includes(ACCESSIBLE_TAG) ?? false);
}

export function buildAccessibleAdjacencyMap(
  nodes: Node[],
  edges: Edge[],
  accessibleOnly: boolean
): Map<string, Neighbor[]> {
  return buildAdjacencyMap(nodes, edges.filter((edge) => isAccessibleEdge(edge, accessibleOnly)));
}

export function euclideanDistance(a: Pick<Node, 'x' | 'y'>, b: Pick<Node, 'x' | 'y'>): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}