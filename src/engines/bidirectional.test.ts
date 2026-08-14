import { describe, expect, it } from 'vitest';
import { bidirectionalShortestPath } from './bidirectional';
import { dijkstraShortestPath } from './routingEngine';
import { CAMPUS_EDGES, CAMPUS_NODES } from '../data/themeConstants';

const bidirectionalRoute = (start: string, end: string, avoidNodes: string[] = []) =>
  bidirectionalShortestPath(CAMPUS_NODES, CAMPUS_EDGES, start, end, avoidNodes);

describe('bidirectionalShortestPath', () => {
  it('finds the shortest route between Main Gate and Library', () => {
    const result = bidirectionalRoute('Main_Gate', 'Library');

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(8);
    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
  });

  it('finds the alternative route when the shortest one is blocked', () => {
    const result = bidirectionalRoute('Main_Gate', 'Library', ['Hostel_A']);

    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('matches Dijkstra optimality across every node pair', () => {
    for (const from of CAMPUS_NODES) {
      for (const to of CAMPUS_NODES) {
        const bidirectional = bidirectionalRoute(from.name, to.name);
        const dijkstra = dijkstraShortestPath(CAMPUS_NODES, CAMPUS_EDGES, from.name, to.name);

        expect(bidirectional.distance).toBe(dijkstra.distance);
        expect(bidirectional.path).toEqual(dijkstra.path);
      }
    }
  });

  it('returns the same node as the route when start equals end', () => {
    const result = bidirectionalRoute('Library', 'Library');

    expect(result.distance).toBe(0);
    expect(result.path).toEqual(['Library']);
  });

  it('treats an unknown start node as an error', () => {
    const result = bidirectionalRoute('Not_A_Place', 'Library');

    expect(result.error).toContain('Start node');
    expect(result.path).toEqual([]);
  });

  it('treats an unknown end node as an error', () => {
    const result = bidirectionalRoute('Library', 'Not_A_Place');

    expect(result.error).toContain('End node');
    expect(result.path).toEqual([]);
  });

  it('reports unreachable destinations when all routes are blocked', () => {
    const result = bidirectionalRoute('Library', 'Main_Gate', ['Cafeteria', 'Hostel_A']);

    expect(result.error).toContain('unreachable');
    expect(result.distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('refuses to start or end on an avoided node', () => {
    const result = bidirectionalRoute('Library', 'Main_Gate', ['Library']);

    expect(result.error).toContain('unreachable');
    expect(result.path).toEqual([]);
  });
});

describe('bidirectionalShortestPath soft avoidance', () => {
  it('keeps the shortest route when the penalty is small', () => {
    const result = bidirectionalShortestPath(
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
    const result = bidirectionalShortestPath(
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
});

describe('bidirectionalShortestPath accessible-only routing', () => {
  it('takes the longer accessible detour when stairs are excluded', () => {
    const result = bidirectionalShortestPath(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [], undefined, true);

    expect(result.error).toBeUndefined();
    expect(result.distance).toBe(9);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });
});