import { describe, expect, it } from 'vitest';
import { astarShortestPath } from './astar';
import { bidirectionalShortestPath } from './bidirectional';
import { dijkstraShortestPath } from './routingEngine';
import { CAMPUS_EDGES, CAMPUS_NODES } from './themeConstants';

describe('search expansion stats', () => {
  it('counts Dijkstra settlements for Main Gate to Library', () => {
    const result = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library');

    expect(result.stats?.expandedNodes).toBe(6);
  });

  it('counts A* expansions and shows fewer than Dijkstra', () => {
    const dijkstra = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library');
    const astar = astarShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library');

    expect(astar.stats?.expandedNodes).toBeLessThan(dijkstra.stats?.expandedNodes ?? 0);
    expect(astar.stats?.expandedNodes).toBe(4);
  });

  it('never expands more nodes than Dijkstra on any query', () => {
    for (const from of CAMPUS_NODES) {
      for (const to of CAMPUS_NODES) {
        const dijkstra = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, from.name, to.name);
        const astar = astarShortestPath(CAMPUS_NODES, CAMPUS_EDGES, from.name, to.name);

        expect(astar.stats?.expandedNodes ?? 0).toBeLessThanOrEqual(dijkstra.stats?.expandedNodes ?? 0);
      }
    }
  });

  it('counts bidirectional settlements across both frontiers', () => {
    const result = bidirectionalShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library');

    expect(result.stats?.expandedNodes).toBe(10);
  });

  it('reports stats even when the destination is unreachable', () => {
    const result = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Library', 'Main_Gate', ['Cafeteria', 'Hostel_A']);

    expect(result.error).toBeDefined();
    expect(result.stats?.expandedNodes).toBeGreaterThan(0);
  });

  it('reports stats for soft-avoidance runs', () => {
    const result = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', ['Hostel_A'], {
      penalty: 100,
    });

    expect(result.stats?.expandedNodes).toBe(5);
  });
});