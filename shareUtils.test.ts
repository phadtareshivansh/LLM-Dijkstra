import { describe, expect, it } from 'vitest';
import { buildShareUrl } from './shareUtils';

const BASE_URL = 'https://example.com/campus/?panel=minimized&origin=Library';

describe('buildShareUrl', () => {
  it('encodes origin and destination', () => {
    const url = buildShareUrl(BASE_URL, { origin: 'Main_Gate', destination: 'Library', avoidNodes: [] });

    expect(url).toBe('https://example.com/campus/?origin=Main_Gate&destination=Library');
  });

  it('encodes avoid nodes as a comma-separated list', () => {
    const url = buildShareUrl(BASE_URL, {
      origin: 'Main_Gate',
      destination: 'Library',
      avoidNodes: ['Auditorium', 'Hostel_A'],
    });

    expect(url).toBe(
      'https://example.com/campus/?origin=Main_Gate&destination=Library&avoid=Auditorium%2CHostel_A'
    );
  });

  it('drops unrelated search parameters from the base URL', () => {
    const url = buildShareUrl(BASE_URL, { origin: 'Main_Gate', destination: 'Library', avoidNodes: [] });

    expect(url).not.toContain('panel');
    expect(url).not.toContain('theme');
  });

  it('keeps the base path when the URL has no search parameters', () => {
    const url = buildShareUrl('https://example.com/', { origin: 'Library', destination: 'Cafeteria', avoidNodes: [] });

    expect(url).toBe('https://example.com/?origin=Library&destination=Cafeteria');
  });
});