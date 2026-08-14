import { describe, expect, it } from 'vitest';
import { findNodeMentions, resolveNodeName, uniqueNodeNames } from './navigationUtils';

describe('navigationUtils', () => {
  describe('resolveNodeName', () => {
    it('resolves an exact node name', () => {
      expect(resolveNodeName('Main_Gate')).toBe('Main_Gate');
    });

    it('resolves a display name with spaces', () => {
      expect(resolveNodeName('Science Lab')).toBe('Science_Lab');
    });

    it('resolves a common alias', () => {
      expect(resolveNodeName('science lab')).toBe('Science_Lab');
      expect(resolveNodeName('main entrance')).toBe('Main_Gate');
      expect(resolveNodeName('canteen')).toBe('Cafeteria');
    });

    it('is case-insensitive', () => {
      expect(resolveNodeName('LIBRARY')).toBe('Library');
    });

    it('returns null for unknown or empty values', () => {
      expect(resolveNodeName('middle of nowhere')).toBeNull();
      expect(resolveNodeName('')).toBeNull();
      expect(resolveNodeName(null)).toBeNull();
    });
  });

  describe('findNodeMentions', () => {
    it('finds nodes mentioned in a phrase', () => {
      const mentions = findNodeMentions('take me from main gate to the library');

      expect(mentions.map((mention) => mention.nodeName)).toEqual(['Main_Gate', 'Library']);
    });

    it('does not double count overlapping aliases', () => {
      const mentions = findNodeMentions('go to the science lab');

      expect(mentions.map((mention) => mention.nodeName)).toEqual(['Science_Lab']);
    });

    it('returns mentions in the order they appear', () => {
      const mentions = findNodeMentions('auditorium then cafeteria then hostel');

      expect(mentions.map((mention) => mention.nodeName)).toEqual(['Auditorium', 'Cafeteria', 'Hostel_A']);
    });

    it('returns an empty list when nothing is mentioned', () => {
      expect(findNodeMentions('hello there')).toEqual([]);
    });
  });

  describe('uniqueNodeNames', () => {
    it('keeps the first occurrence of each name', () => {
      expect(uniqueNodeNames(['Library', 'Library', 'Main_Gate', 'Library'])).toEqual(['Library', 'Main_Gate']);
    });
  });
});