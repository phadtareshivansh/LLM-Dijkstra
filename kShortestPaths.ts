import { Edge, Node } from './themeConstants';
import { dijkstraShortestPath, SoftAvoidanceConfig } from './routingEngine';
import { pathDistance } from './graphUtils';

export interface AlternativeRoute {
  path: string[];
  distance: number;
}

export { pathDistance };

function sharedPrefixLength(left: string[], right: string[]): number {
  let prefixLength = 0;

  while (prefixLength < left.length && prefixLength < right.length && left[prefixLength] === right[prefixLength]) {
    prefixLength += 1;
  }

  return prefixLength;
}

function pathSignature(path: string[]): string {
  return path.join('->');
}

/**
 * Finds up to `limit` distinct loopless shortest paths using Yen's algorithm.
 *
 * The first result is the plain Dijkstra shortest path; each subsequent result
 * is the next shortest route that differs from every previously found route.
 * The `avoidNodes` restriction is applied consistently across all routes.
 */
export function kShortestPaths(
  nodes: Node[],
  edges: Edge[],
  start: string,
  end: string,
  avoidNodes: string[] = [],
  limit = 3,
  softAvoidance?: SoftAvoidanceConfig,
  accessibleOnly = false
): AlternativeRoute[] {
  if (limit <= 0) {
    return [];
  }

  const found: AlternativeRoute[] = [];
  const candidatePool: AlternativeRoute[] = [];

  const shortest = dijkstraShortestPath(nodes, edges, start, end, avoidNodes, softAvoidance, accessibleOnly);

  if (shortest.error || shortest.path.length === 0) {
    return [];
  }

  found.push({ path: shortest.path, distance: shortest.distance });

  while (found.length < limit) {
    const previous = found[found.length - 1];
    const freshCandidates: AlternativeRoute[] = [];

    for (let spurIndex = 0; spurIndex < previous.path.length - 1; spurIndex += 1) {
      const spurNode = previous.path[spurIndex];
      const rootPath = previous.path.slice(0, spurIndex + 1);
      const blockedEdges = new Set<string>();

      const blockEdge = (from: string, to: string) => {
        blockedEdges.add(`${from}->${to}`);
        blockedEdges.add(`${to}->${from}`);
      };

      // Yen's rule: whenever an already-found route shares this exact root
      // prefix, its outgoing edge from the spur node is removed, forcing the
      // spur path to deviate somewhere before rejoining the route.
      for (const foundRoute of found) {
        const sharesRoot =
          sharedPrefixLength(foundRoute.path, rootPath) === rootPath.length &&
          foundRoute.path.length > spurIndex + 1;

        if (sharesRoot) {
          blockEdge(foundRoute.path[spurIndex], foundRoute.path[spurIndex + 1]);
        }
      }

      const spurEdges = edges.filter((edge) => !blockedEdges.has(`${edge.from}->${edge.to}`));
      const spurAvoidNodes = [...avoidNodes, ...rootPath.slice(0, -1)];
      const spurResult = dijkstraShortestPath(nodes, spurEdges, spurNode, end, spurAvoidNodes, softAvoidance, accessibleOnly);

      if (spurResult.error || spurResult.path.length === 0) {
        continue;
      }

      const totalPath = [...rootPath.slice(0, -1), ...spurResult.path];
      const signature = pathSignature(totalPath);
      const alreadyKnown =
        found.some((route) => pathSignature(route.path) === signature) ||
        candidatePool.some((route) => pathSignature(route.path) === signature) ||
        freshCandidates.some((route) => pathSignature(route.path) === signature);

      if (!alreadyKnown) {
        freshCandidates.push({ path: totalPath, distance: pathDistance(totalPath, edges) });
      }
    }

    candidatePool.push(...freshCandidates);
    candidatePool.sort((left, right) => left.distance - right.distance);

    const best = candidatePool.shift();

    if (!best) {
      break;
    }

    found.push(best);
  }

  return found;
}