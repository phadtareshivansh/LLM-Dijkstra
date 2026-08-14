import { describe, expect, it } from 'vitest';
import { astarShortestPath } from './astar';
import { kShortestPaths, pathDistance } from './kShortestPaths';
import { CAMPUS_EDGES, CAMPUS_NODES } from '../data/themeConstants';

describe('kShortestPaths', () => {
  it('finds the two shortest routes between Main Gate and Library', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], 3);

    expect(routes).toHaveLength(2);
    expect(routes[0]).toEqual({
      path: ['Main_Gate', 'Auditorium', 'Hostel_A', 'Library'],
      distance: 8,
    });
    expect(routes[1]).toEqual({
      path: ['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library'],
      distance: 9,
    });
  });

  it('returns routes ordered by ascending distance', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Cafeteria', 'Auditorium', [], 5);
    const distances = routes.map((route) => route.distance);

    expect(distances).toEqual([...distances].sort((left, right) => left - right));
  });

  it('respects the route limit', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], 1);

    expect(routes).toHaveLength(1);
    expect(routes[0].distance).toBe(8);
  });

  it('applies avoid nodes to every alternative route', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', ['Hostel_A'], 3);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('collapses start equals end to a single zero-distance route', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Library', 'Library', [], 3);

    expect(routes).toEqual([{ path: ['Library'], distance: 0 }]);
  });

  it('returns no routes when the start node is unknown', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Nowhere', 'Library', [], 3);

    expect(routes).toEqual([]);
  });

  it('returns no routes when the destination is unreachable', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Library', 'Main_Gate', ['Cafeteria', 'Hostel_A'], 3);

    expect(routes).toEqual([]);
  });

  it('never returns duplicate paths', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Cafeteria', 'Auditorium', [], 5);
    const signatures = new Set(routes.map((route) => route.path.join('->')));

    expect(signatures.size).toBe(routes.length);
  });

  it('ignores a non-positive limit', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], 0);

    expect(routes).toEqual([]);
  });

  it('ranks the detour first when soft avoidance penalizes the shortest path', () => {
    const routes = kShortestPaths(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      'Library',
      ['Hostel_A'],
      3,
      { penalty: 100 }
    );

    const signatures = routes.map((route) => route.path.join('->'));

    expect(routes[0].path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
    expect(signatures).toContain('Main_Gate->Auditorium->Hostel_A->Library');
  });

  it('only offers accessible routes when accessible-only is enabled', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], 3, undefined, true);

    expect(routes).toHaveLength(1);
    expect(routes[0].path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
    expect(routes[0].distance).toBe(9);
  });

  it('finds the same alternatives with A* as the search function', () => {
    const routes = kShortestPaths(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], 3, undefined, false, astarShortestPath);

    expect(routes).toHaveLength(2);
    expect(routes[0].path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
    expect(routes[1].path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });
});

describe('pathDistance', () => {
  it('sums the weights along the path', () => {
    expect(pathDistance(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library'], CAMPUS_EDGES)).toBe(9);
  });

  it('returns zero for a single-node path', () => {
    expect(pathDistance(['Library'], CAMPUS_EDGES)).toBe(0);
  });

  it('returns infinity for an unknown edge', () => {
    expect(pathDistance(['Library', 'Nowhere'], CAMPUS_EDGES)).toBe(Number.POSITIVE_INFINITY);
  });
});