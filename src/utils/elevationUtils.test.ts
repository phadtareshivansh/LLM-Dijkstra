import { describe, expect, it } from 'vitest';
import { buildElevationProfile, elevationStats } from './elevationUtils';
import { CAMPUS_NODES } from '../data/themeConstants';

describe('buildElevationProfile', () => {
  it('maps each node on the path to its elevation and step', () => {
    const profile = buildElevationProfile(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library'], CAMPUS_NODES);

    expect(profile).toEqual([
      { node: 'Main_Gate', elevation: 28, step: 0 },
      { node: 'Auditorium', elevation: 36, step: 1 },
      { node: 'Hostel_A', elevation: 41, step: 2 },
      { node: 'Library', elevation: 22, step: 3 },
    ]);
  });

  it('skips unknown nodes', () => {
    const profile = buildElevationProfile(['Main_Gate', 'Nowhere', 'Library'], CAMPUS_NODES);

    expect(profile.map((point) => point.node)).toEqual(['Main_Gate', 'Library']);
  });

  it('returns an empty profile for an empty path', () => {
    expect(buildElevationProfile([], CAMPUS_NODES)).toEqual([]);
  });
});

describe('elevationStats', () => {
  it('sums ascent and descent along the path', () => {
    const profile = buildElevationProfile(['Main_Gate', 'Auditorium', 'Hostel_A', 'Library'], CAMPUS_NODES);
    const stats = elevationStats(profile);

    expect(stats.ascent).toBe(13);
    expect(stats.descent).toBe(19);
    expect(stats.net).toBe(-6);
    expect(stats.min).toBe(22);
    expect(stats.max).toBe(41);
  });

  it('returns zeroed stats for a single point', () => {
    expect(elevationStats([{ node: 'Library', elevation: 22, step: 0 }])).toEqual({
      ascent: 0,
      descent: 0,
      net: 0,
      min: 22,
      max: 22,
    });
  });

  it('returns zeroed stats for an empty profile', () => {
    expect(elevationStats([])).toEqual({ ascent: 0, descent: 0, net: 0, min: 0, max: 0 });
  });
});