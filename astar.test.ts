import { describe, expect, it } from 'vitest';
import { astarShortestPath } from './astar';
import { dijkstraShortestPath } from './routingEngine';
import { CAMPUS_EDGES, CAMPUS_NODES } from './themeConstants';

const astarRoute = (start: string, end: string, avoidNodes: string[] = []) =>
  astarShortestPath(CAMPUS_NODES, CAMPUS_EDGES, start, end, avoidNodes);

describe('astarShortestPath', () => {
  it('finds the shortest route between Main Gate and Library', () => {
    const result = astarRoute('Main_Gate', 'Library');

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(8);
    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
  });

  it('finds the alternative route when the shortest one is blocked', () => {
    const result = astarRoute('Main_Gate', 'Library', ['Hostel_A']);

    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('matches Dijkstra optimality across every node pair', () => {
    for (const from of CAMPUS_NODES) {
      for (const to of CAMPUS_NODES) {
        const astar = astarRoute(from.name, to.name);
        const dijkstra = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, from.name, to.name);

        expect(astar.distance).toBe(dijkstra.distance);
        expect(astar.path).toEqual(dijkstra.path);
      }
    }
  });

  it('returns the same node as the route when start equals end', () => {
    const result = astarRoute('Library', 'Library');

    expect(result.distance).toBe(0);
    expect(result.path).toEqual(['Library']);
  });

  it('treats an unknown start node as an error', () => {
    const result = astarRoute('Not_A_Place', 'Library');

    expect(result.error).toContain('Start node');
    expect(result.path).toEqual([]);
  });

  it('treats an unknown end node as an error', () => {
    const result = astarRoute('Library', 'Not_A_Place');

    expect(result.error).toContain('End node');
    expect(result.path).toEqual([]);
  });

  it('reports unreachable destinations when all routes are blocked', () => {
    const result = astarRoute('Library', 'Main_Gate', ['Cafeteria', 'Hostel_A']);

    expect(result.error).toContain('unreachable');
    expect(result.distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('refuses to start or end on an avoided node', () => {
    const result = astarRoute('Library', 'Main_Gate', ['Library']);

    expect(result.error).toContain('unreachable');
    expect(result.path).toEqual([]);
  });
});

describe('astarShortestPath soft avoidance', () => {
  it('keeps the shortest route when the penalty is small', () => {
    const result = astarShortestPath(
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
    const result = astarShortestPath(
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
    const result = astarShortestPath(
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

describe('astarShortestPath accessible-only routing', () => {
  it('takes the longer accessible detour when stairs are excluded', () => {
    const result = astarShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], undefined, true);

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });
});