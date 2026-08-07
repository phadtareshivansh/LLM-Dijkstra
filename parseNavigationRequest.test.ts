import { describe, expect, it } from 'vitest';
import { parseNavigationRequest } from './parseNavigationRequest';

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

  it('returns empty fields when no campus location is mentioned', async () => {
    const parsed = await parseNavigationRequest('what is the weather today');

    expect(parsed.origin).toBeNull();
    expect(parsed.destination).toBeNull();
    expect(parsed.avoid_nodes).toEqual([]);
  });
});
