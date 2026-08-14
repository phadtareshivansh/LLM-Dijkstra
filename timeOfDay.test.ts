import { describe, expect, it } from 'vitest';
import { applyTimeOfDayEdges } from './timeOfDay';
import { CAMPUS_EDGES, CAMPUS_NODES, STAIRS_TAG } from './themeConstants';
import { dijkstraShortestPath } from './routingEngine';

const routeDistance = (timeOfDay: Parameters<typeof applyTimeOfDayEdges>[1]) => {
  const edges = applyTimeOfDayEdges(CAMPUS_EDGES, timeOfDay);
  return dijkstraShortestPath(CAMPUS_NODES, edges, 'Main_Gate', 'Library').distance;
};

describe('applyTimeOfDayEdges', () => {
  it('leaves edges untouched off-peak', () => {
    expect(applyTimeOfDayEdges(CAMPUS_EDGES, 'off-peak')).toEqual(CAMPUS_EDGES);
  });

  it('scales every edge at peak time', () => {
    const edges = applyTimeOfDayEdges(CAMPUS_EDGES, 'peak');

    expect(edges).toHaveLength(CAMPUS_EDGES.length);
    expect(edges.find((edge) => edge.to === 'Cafeteria')?.weight).toBe(2 * 1.6);
    expect(edges.find((edge) => edge.from === 'Science_Lab' && edge.to === 'Main_Gate')?.weight).toBe(4 * 1.6);
  });

  it('applies the heavier stairs multiplier to narrow routes', () => {
    const stairsEdge = CAMPUS_EDGES.find((edge) => edge.tags?.includes(STAIRS_TAG));
    const edges = applyTimeOfDayEdges(CAMPUS_EDGES, 'peak');
    const scaled = edges.find((edge) => edge.from === stairsEdge?.from && edge.to === stairsEdge?.to);

    expect(scaled?.weight).toBe((stairsEdge?.weight ?? 0) * 4);
  });

  it('drops night-closed edges at night', () => {
    const edges = applyTimeOfDayEdges(CAMPUS_EDGES, 'night');

    expect(edges).toHaveLength(CAMPUS_EDGES.length - 1);
    expect(edges.some((edge) => edge.from === 'Library' && edge.to === 'Cafeteria')).toBe(false);
  });
});

describe('time-of-day routing', () => {
  it('takes the stairs route off-peak', () => {
    expect(routeDistance('off-peak')).toBe(8);
  });

  it('switches to the science-lab route at peak time', () => {
    const peakEdges = applyTimeOfDayEdges(CAMPUS_EDGES, 'peak');
    const result = dijkstraShortestPath(CAMPUS_NODES, peakEdges, 'Main_Gate', 'Library');

    expect(result.distance).toBeCloseTo(14.4, 5);
    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
  });

  it('falls back to the hostel route when the cafeteria closes at night', () => {
    const nightEdges = applyTimeOfDayEdges(CAMPUS_EDGES, 'night');
    const result = dijkstraShortestPath(CAMPUS_NODES, nightEdges, 'Main_Gate', 'Library');

    expect(result.distance).toBe(8);
    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
  });
});