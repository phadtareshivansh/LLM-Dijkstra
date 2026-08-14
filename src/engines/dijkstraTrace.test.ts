import { describe, expect, it } from 'vitest';
import { CAMPUS_EDGES, CAMPUS_NODES } from '../data/themeConstants';
import { UNREACHABLE_ERROR, dijkstraTrace } from './routingEngine';

describe('dijkstraTrace', () => {
  it('records the full exploration step by step for Main_Gate to Library', () => {
    const result = dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library');

    expect(result.steps).toHaveLength(6);
    expect(result.steps.map((step) => step.settledNode)).toEqual([
      'Main_Gate',
      'Auditorium',
      'Hostel_A',
      'Science_Lab',
      'Cafeteria',
      'Library',
    ]);

    expect(result.steps.map((step) => step.settledDistance)).toEqual([0, 1, 3, 4, 7, 8]);

    expect(result.steps[0].relaxations).toEqual([
      { from: 'Main_Gate', to: 'Science_Lab', proposedDistance: 4, improved: true },
      { from: 'Main_Gate', to: 'Auditorium', proposedDistance: 1, improved: true },
    ]);

    const hostelStep = result.steps[2];
    expect(hostelStep.relaxations).toContainEqual({
      from: 'Hostel_A',
      to: 'Library',
      proposedDistance: 8,
      improved: true,
    });

    const cafeteriaStep = result.steps[4];
    expect(cafeteriaStep.relaxations).toContainEqual({
      from: 'Cafeteria',
      to: 'Library',
      proposedDistance: 9,
      improved: false,
    });

    const finalStep = result.steps[5];
    expect(finalStep.finished).toBe(true);
    expect(finalStep.settledNode).toBe('Library');
    expect(finalStep.settledDistance).toBe(8);
    expect(finalStep.distanceByNode.get('Library')).toBe(8);
    expect(finalStep.previousByNode.get('Library')).toBe('Hostel_A');

    expect(result.path).toEqual(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library']);
    expect(result.distance).toBe(8);
    expect(result.error).toBeUndefined();
  });

  it('marks the destination as reached only on the final step', () => {
    const result = dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library');

    expect(result.steps.slice(0, -1).every((step) => step.finished === false)).toBe(true);
    expect(result.steps[result.steps.length - 1].finished).toBe(true);
  });

  it('skips avoided nodes entirely', () => {
    const result = dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', ['Hostel_A']);

    expect(result.steps.some((step) => step.settledNode === 'Hostel_A')).toBe(false);
    expect(result.steps.some((step) => step.relaxations.some((relaxation) => relaxation.to === 'Hostel_A'))).toBe(
      false
    );

    expect(result.path).toEqual(['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library']);
    expect(result.distance).toBe(9);
  });

  it('returns an error for an unknown start or end node', () => {
    const startError = dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, 'Unknown', 'Library');
    expect(startError.error).toContain('does not exist');
    expect(startError.steps).toEqual([]);

    const endError = dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Unknown');
    expect(endError.error).toContain('does not exist');
  });

  it('returns an unreachable error when every path is blocked', () => {
    const result = dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, 'Main_Gate', 'Library', [
      'Auditorium',
      'Science_Lab',
    ]);

    expect(result.error).toBe(UNREACHABLE_ERROR);
    expect(result.path).toEqual([]);
    expect(result.distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('handles start equal to end with a single finished step', () => {
    const result = dijkstraTrace(CAMPUS_NODES, CAMPUS_EDGES, 'Library', 'Library');

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].settledNode).toBe('Library');
    expect(result.steps[0].settledDistance).toBe(0);
    expect(result.steps[0].finished).toBe(true);
    expect(result.path).toEqual(['Library']);
    expect(result.distance).toBe(0);
  });
});