import { describe, expect, it } from 'vitest';
import { dijkstraShortestPath, dijkstraShortestPathWithWaypoints } from './routingEngine';
import { CAMPUS_EDGES, CAMPUS_NODES } from './themeConstants';

const shortestRoute = (start: string, end: string, avoidNodes: string[] = []) =>
  dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, start, end, avoidNodes);

describe('dijkstraShortestPath', () => {
  it('finds the shortest route between Main Gate and Library', () => {
    const result = shortestRoute('Main_Gate', 'Library');

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(8);
    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
  });

  it('finds the alternative route when the shortest one is blocked', () => {
    const result = shortestRoute('Main_Gate', 'Library', ['Hostel_A']);

    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('returns the same node as the route when start equals end', () => {
    const result = shortestRoute('Library', 'Library');

    expect(result.distance).toBe(0);
    expect(result.path).toEqual(['Library']);
  });

  it('treats an unknown start node as an error', () => {
    const result = shortestRoute('Not_A_Place', 'Library');

    expect(result.error).toContain('Start node');
    expect(result.path).toEqual([]);
  });

  it('treats an unknown end node as an error', () => {
    const result = shortestRoute('Library', 'Not_A_Place');

    expect(result.error).toContain('End node');
    expect(result.path).toEqual([]);
  });

  it('reports unreachable destinations when all routes are blocked', () => {
    const result = shortestRoute('Library', 'Main_Gate', ['Cafeteria', 'Hostel_A']);

    expect(result.error).toContain('unreachable');
    expect(result.distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('refuses to start or end on an avoided node', () => {
    const result = shortestRoute('Library', 'Main_Gate', ['Library']);

    expect(result.error).toContain('unreachable');
    expect(result.path).toEqual([]);
  });

  it('uses the same distance in both directions', () => {
    const forward = shortestRoute('Cafeteria', 'Auditorium');
    const backward = shortestRoute('Auditorium', 'Cafeteria');

    expect(forward.distance).toBe(backward.distance);
    expect(forward.distance).toBe(8);
  });
});

describe('dijkstraShortestPath soft avoidance', () => {
  it('keeps the shortest route when the penalty is small', () => {
    const result = dijkstraShortestPath(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      'Library',
      ['Hostel_A'],
      { penalty: 0.1 }
    );

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(8.2);
    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
  });

  it('switches to the alternative route when the penalty outweighs the detour', () => {
    const result = dijkstraShortestPath(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      'Library',
      ['Hostel_A'],
      { penalty: 100 }
    );

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('never blocks the route entirely when every path touches a soft-avoided node', () => {
    const result = dijkstraShortestPath(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      'Library',
      ['Auditorium', 'Science_Lab'],
      { penalty: 100 }
    );

    expect(result.error).toBeUndefined();
    expect(result.path).toContain('Auditorium');
  });
});

describe('dijkstraShortestPath accessible-only routing', () => {
  it('prefers the stair path when accessibility is not enforced', () => {
    const result = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library');

    expect(result.distance).toBe(8);
    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
  });

  it('takes the longer accessible detour when stairs are excluded', () => {
    const result = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], undefined, true);

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('combines accessible-only with soft avoidance', () => {
    const result = dijkstraShortestPath(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      'Library',
      ['Hostel_A'],
      { penalty: 100 },
      true
    );

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });
});

describe('dijkstraShortestPathWithWaypoints', () => {
  it('chains segments through a waypoint', () => {
    const result = dijkstraShortestPathWithWaypoints(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      ['Cafeteria'],
      'Library'
    );

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
    expect(result.segments).toEqual([
      { path: ['Main_Gate', 'Science_Lab', 'Cafeteria'], distance: 7 },
      { path: ['Cafeteria', 'Library'], distance: 2 },
    ]);
  });

  it('visits multiple waypoints in order', () => {
    const result = dijkstraShortestPathWithWaypoints(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Library',
      ['Cafeteria', 'Main_Gate'],
      'Hostel_A'
    );

    expect(result.error).toBeUndefined();
    expect(result.path).toEqual([
      'Library',
      'Cafeteria',
      'Science_Lab',
      'Main_Gate',
      'Auditorium',
      'Hostel_A',
    ]);
    expect(result.segments).toHaveLength(3);
  });

  it('passes soft avoidance through to every segment', () => {
    const result = dijkstraShortestPathWithWaypoints(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      ['Cafeteria'],
      'Library',
      ['Hostel_A'],
      { penalty: 100 }
    );

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('returns an error when a waypoint is unknown', () => {
    const result = dijkstraShortestPathWithWaypoints(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      ['Not_A_Place'],
      'Library'
    );

    expect(result.error).toContain('Not_A_Place');
    expect(result.path).toEqual([]);
  });

  it('handles an empty waypoint list as a plain shortest path', () => {
    const result = dijkstraShortestPathWithWaypoints(
      CAMPUS_NODES,
      CAMPUS_EDGES,
      'Main_Gate',
      [],
      'Library'
    );

    expect(result.distance).toBe(8);
    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
    expect(result.segments).toEqual([
      { path: ['Main_Gate', 'Auditorium', 'Hostel_A', 'Library'], distance: 8 },
    ]);
  });
});
