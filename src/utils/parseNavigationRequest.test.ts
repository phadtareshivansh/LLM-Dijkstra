import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARSE_CACHE_MAX_ENTRIES,
  parseNavigationRequest,
  PARSE_CACHE_TTL_MS,
  withTimeout,
} from './parseNavigationRequest';

describe('parseNavigationRequest', () => {
  it('extracts origin and destination from a from/to request', async () => {
    const parsed = await parseNavigationRequest('go from main gate to the cafeteria');

    expect(parsed.origin).toBe('Main_Gate');
    expect(parsed.destination).toBe('Cafeteria');
    expect(parsed.avoid_nodes).toEqual([]);
  });

  it('extracts a destination-only request', async () => {
    const parsed = await parseNavigationRequest('take me to the library');

    expect(parsed.origin).toBeNull();
    expect(parsed.destination).toBe('Library');
  });

  it('extracts an origin-only request', async () => {
    const parsed = await parseNavigationRequest('starting from the hostel');

    expect(parsed.origin).toBe('Hostel_A');
    expect(parsed.destination).toBeNull();
  });

  it('understands informal building names', async () => {
    const parsed = await parseNavigationRequest('please guide me to the science block');

    expect(parsed.destination).toBe('Science_Lab');
  });

  it('picks up nodes to avoid', async () => {
    const parsed = await parseNavigationRequest('from cafeteria to auditorium avoiding the library');

    expect(parsed.origin).toBe('Cafeteria');
    expect(parsed.destination).toBe('Auditorium');
    expect(parsed.avoid_nodes).toEqual(['Library']);
  });

  it('supports the "without" wording for avoidance', async () => {
    const parsed = await parseNavigationRequest('navigate without the science lab');

    expect(parsed.avoid_nodes).toEqual(['Science_Lab']);
  });

  it('handles a skip clause that precedes the route description', async () => {
    const parsed = await parseNavigationRequest('skip the cafeteria and go to the library');

    expect(parsed.origin).toBeNull();
    expect(parsed.destination).toBe('Library');
    expect(parsed.avoid_nodes).toEqual(['Cafeteria']);
  });

  it('never lists the destination among the avoided nodes', async () => {
    const parsed = await parseNavigationRequest('go to the library, skip the library');

    expect(parsed.destination).toBe('Library');
    expect(parsed.avoid_nodes).toEqual([]);
  });

  it('returns empty fields when no campus location is mentioned', async () => {
    const parsed = await parseNavigationRequest('what is the weather today');

    expect(parsed.origin).toBeNull();
    expect(parsed.destination).toBeNull();
    expect(parsed.avoid_nodes).toEqual([]);
  });

  it('treats "via" phrases as waypoints, not endpoints', async () => {
    const parsed = await parseNavigationRequest('go via the cafeteria to the library');

    expect(parsed.origin).toBeNull();
    expect(parsed.destination).toBe('Library');
    expect(parsed.waypoints).toEqual(['Cafeteria']);
  });

  it('extracts waypoints from a from/to route', async () => {
    const parsed = await parseNavigationRequest('from the main gate to the library via the hostel');

    expect(parsed.origin).toBe('Main_Gate');
    expect(parsed.destination).toBe('Library');
    expect(parsed.waypoints).toEqual(['Hostel_A']);
  });

  it('supports the "through" wording for waypoints', async () => {
    const parsed = await parseNavigationRequest('to the library through the science lab');

    expect(parsed.destination).toBe('Library');
    expect(parsed.waypoints).toEqual(['Science_Lab']);
  });

  it('parses "instead of" phrases as avoidance', async () => {
    const parsed = await parseNavigationRequest('take me to the library instead of the cafeteria');

    expect(parsed.destination).toBe('Library');
    expect(parsed.avoid_nodes).toEqual(['Cafeteria']);
  });
});

describe('withTimeout', () => {
  it('rejects when the wrapped promise exceeds the timeout', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 50));

    await expect(withTimeout(slow, 10)).rejects.toThrow('timed out');
  });

  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });

  it('forwards rejections from the wrapped promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('network down')), 100)).rejects.toThrow('network down');
  });
});

describe('parseNavigationRequest caching', () => {
  const memoryStore = new Map<string, string>();
  const fakeLocalStorage: Storage = {
    get length() {
      return memoryStore.size;
    },
    clear: () => memoryStore.clear(),
    getItem: (key: string) => memoryStore.get(key) ?? null,
    key: (index: number) => Array.from(memoryStore.keys())[index] ?? null,
    removeItem: (key: string) => memoryStore.delete(key),
    setItem: (key: string, value: string) => memoryStore.set(key, value),
  };

  beforeEach(() => {
    memoryStore.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: fakeLocalStorage,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
  });

  it('serves a previously cached parse for the same input', async () => {
    const first = await parseNavigationRequest('from main gate to the library');
    const second = await parseNavigationRequest('from main gate to the library');

    expect(second).toEqual(first);
    expect(second.origin).toBe('Main_Gate');
    expect(second.destination).toBe('Library');
    expect(second.avoid_nodes).toEqual([]);
  });

  it('stores an entry keyed by the raw input', async () => {
    await parseNavigationRequest('go to the canteen');

    const cachedKeys = Array.from(memoryStore.keys());

    expect(cachedKeys.some((key) => key.includes('go to the canteen'))).toBe(true);
  });

  it('treats an expired entry as a cache miss', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    await parseNavigationRequest('take me to the library');

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + PARSE_CACHE_TTL_MS + 1);

    const refreshed = await parseNavigationRequest('take me to the library');

    expect(refreshed.destination).toBe('Library');
    expect(memoryStore.size).toBe(1);
  });

  it('evicts stale entries for other inputs when writing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    await parseNavigationRequest('take me to the library');

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + PARSE_CACHE_TTL_MS + 1);

    await parseNavigationRequest('take me to the cafeteria');

    const cachedKeys = Array.from(memoryStore.keys());

    expect(cachedKeys.some((key) => key.includes('cafeteria'))).toBe(true);
    expect(cachedKeys.some((key) => key.includes('library'))).toBe(false);
    expect(memoryStore.size).toBe(1);
  });

  it('caps the number of cached entries', async () => {
    for (let index = 0; index < PARSE_CACHE_MAX_ENTRIES + 10; index += 1) {
      await parseNavigationRequest(`route number ${index} to the library`);
    }

    expect(memoryStore.size).toBeLessThanOrEqual(PARSE_CACHE_MAX_ENTRIES);
  });

  it('is a no-op when localStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });

    const parsed = await parseNavigationRequest('go to the auditorium');

    expect(parsed.destination).toBe('Auditorium');
  });

  it('skips the cache for contextual follow-ups', async () => {
    await parseNavigationRequest('avoid the cafeteria', {
      origin: 'Main_Gate',
      destination: 'Library',
      avoid_nodes: [],
      waypoints: [],
    });

    const cachedKeys = Array.from(memoryStore.keys());

    expect(cachedKeys.some((key) => key.includes('cafeteria'))).toBe(false);
  });
});

describe('parseNavigationRequest with conversation context', () => {
  const context = {
    origin: 'Main_Gate',
    destination: 'Library',
    avoid_nodes: ['Hostel_A'],
    waypoints: [],
  };

  it('keeps the current endpoints when the follow-up only adds an avoid', async () => {
    const parsed = await parseNavigationRequest('avoid the cafeteria', context);

    expect(parsed.origin).toBe('Main_Gate');
    expect(parsed.destination).toBe('Library');
    expect(parsed.avoid_nodes).toEqual(['Hostel_A', 'Cafeteria']);
  });

  it('adds waypoints from a "via" follow-up while keeping existing ones', async () => {
    const parsed = await parseNavigationRequest('go via the cafeteria', {
      ...context,
      waypoints: ['Science_Lab'],
    });

    expect(parsed.origin).toBe('Main_Gate');
    expect(parsed.destination).toBe('Library');
    expect(parsed.waypoints).toEqual(['Science_Lab', 'Cafeteria']);
  });

  it('replaces avoids when the follow-up says "instead"', async () => {
    const parsed = await parseNavigationRequest('skip the cafeteria instead', context);

    expect(parsed.origin).toBe('Main_Gate');
    expect(parsed.destination).toBe('Library');
    expect(parsed.avoid_nodes).toEqual(['Cafeteria']);
  });

  it('lets new endpoints override the context', async () => {
    const parsed = await parseNavigationRequest('from cafeteria to the auditorium', context);

    expect(parsed.origin).toBe('Cafeteria');
    expect(parsed.destination).toBe('Auditorium');
    expect(parsed.avoid_nodes).toEqual(['Hostel_A']);
  });

  it('is a no-op when the follow-up mentions nothing', async () => {
    const parsed = await parseNavigationRequest('what about the weather', context);

    expect(parsed.origin).toBe('Main_Gate');
    expect(parsed.destination).toBe('Library');
    expect(parsed.avoid_nodes).toEqual(['Hostel_A']);
  });
});
