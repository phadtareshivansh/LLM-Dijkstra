import { describe, expect, it } from 'vitest';
import { buildDirections, formatDirectionText } from './directions';
import { CAMPUS_EDGES } from './themeConstants';

const primaryRoute = ['Main_Gate', 'Auditorium', 'Hostel_A', 'Library'];
const alternativeRoute = ['Main_Gate', 'Science_Lab', 'Cafeteria', 'Library'];

describe('buildDirections', () => {
  it('splits a route into one leg per edge', () => {
    const legs = buildDirections(primaryRoute, CAMPUS_EDGES);

    expect(legs).toHaveLength(3);
    expect(legs[0]).toEqual({ index: 0, from: 'Main_Gate', to: 'Auditorium', distance: 1, cumulativeDistance: 1 });
    expect(legs[1]).toEqual({ index: 1, from: 'Auditorium', to: 'Hostel_A', distance: 2, cumulativeDistance: 3 });
    expect(legs[2]).toEqual({ index: 2, from: 'Hostel_A', to: 'Library', distance: 5, cumulativeDistance: 8 });
  });

  it('returns no legs for a single-node route', () => {
    expect(buildDirections(['Library'], CAMPUS_EDGES)).toEqual([]);
  });

  it('accumulates distances along the legs', () => {
    const legs = buildDirections(alternativeRoute, CAMPUS_EDGES);

    expect(legs[legs.length - 1].cumulativeDistance).toBe(9);
  });

  it('throws when a leg references an unknown edge', () => {
    expect(() => buildDirections(['Library', 'Nowhere'], CAMPUS_EDGES)).toThrow('does not exist');
  });
});

describe('formatDirectionText', () => {
  it('formats a leg as plain English', () => {
    expect(formatDirectionText({ index: 0, from: 'Main_Gate', to: 'Auditorium', distance: 1, cumulativeDistance: 1 })).toBe(
      '1. Head from Main Gate to Auditorium (1 unit).'
    );
  });

  it('pluralizes the distance label', () => {
    expect(formatDirectionText({ index: 1, from: 'Hostel_A', to: 'Library', distance: 5, cumulativeDistance: 8 })).toBe(
      '2. Head from Hostel A to Library (5 units).'
    );
  });
});