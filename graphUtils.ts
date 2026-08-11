import { Edge } from './themeConstants';

export function buildEdgeWeightMap(edges: Edge[]): Map<string, number> {
  const weightMap = new Map<string, number>();

  for (const edge of edges) {
    weightMap.set(`${edge.from}->${edge.to}`, edge.weight);
    weightMap.set(`${edge.to}->${edge.from}`, edge.weight);
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