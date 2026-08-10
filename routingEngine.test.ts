import { describe, expect, it } from 'vitest';
import { dijkstraShortestPath } from './routingEngine';
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
