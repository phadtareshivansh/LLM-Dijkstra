import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  loadPreferences,
  savePreferences,
} from './preferences';

describe('preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('round-trips saved preferences', () => {
    savePreferences({ viewMode: 'dijkstra', showEdgeWeights: false, speedMs: 400, softAvoidance: false, accessibleOnly: true, algorithm: 'astar', timeOfDay: 'night' });
    expect(loadPreferences()).toEqual({ viewMode: 'dijkstra', showEdgeWeights: false, speedMs: 400, softAvoidance: false, accessibleOnly: true, algorithm: 'astar', timeOfDay: 'night' });
  });

  it('round-trips the bidirectional algorithm preference', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, algorithm: 'bidirectional' });
    expect(loadPreferences().algorithm).toBe('bidirectional');
  });

  it('falls back to dijkstra for an unknown algorithm value', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ algorithm: 'breadth-first' }));
    expect(loadPreferences().algorithm).toBe('dijkstra');
  });

  it('falls back to off-peak for an unknown time-of-day value', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ timeOfDay: 'midnight' }));
    expect(loadPreferences().timeOfDay).toBe('off-peak');
  });

  it('falls back to defaults for invalid or partial values', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ viewMode: 'nope', speedMs: 'slow' }));
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);

    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ showEdgeWeights: false }));
    expect(loadPreferences()).toEqual({ ...DEFAULT_PREFERENCES, showEdgeWeights: false });
  });

  it('clamps out-of-range speed values', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ speedMs: 10 }));
    expect(loadPreferences().speedMs).toBe(200);

    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ speedMs: 9000 }));
    expect(loadPreferences().speedMs).toBe(3000);
  });

  it('recovers from corrupt storage', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, '{not-json');
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});