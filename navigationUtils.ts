import { CAMPUS_NODES } from './themeConstants';

const EXTRA_NODE_ALIASES: Record<string, string[]> = {
  Library: ['lib', 'central library'],
  Cafeteria: ['cafe', 'canteen', 'food court'],
  Science_Lab: ['science lab', 'lab', 'science block', 'science building'],
  Hostel_A: ['hostel', 'hostel a', 'hostel-a', 'dorm', 'residence'],
  Auditorium: ['audi', 'auditorium hall', 'seminar hall'],
  Main_Gate: ['main gate', 'gate', 'entrance', 'main entrance', 'front gate'],
};

export interface NodeMention {
  nodeName: string;
  startIndex: number;
  matchText: string;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNodeLookup(): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const node of CAMPUS_NODES) {
    const aliases = [node.name, node.name.replace(/_/g, ' '), ...(EXTRA_NODE_ALIASES[node.name] ?? [])];

    for (const alias of aliases) {
      lookup.set(normalizeText(alias), node.name);
    }
  }

  return lookup;
}

const NODE_LOOKUP = buildNodeLookup();
const NODE_ALIASES_BY_LENGTH = Array.from(NODE_LOOKUP.keys()).sort((left, right) => right.length - left.length);

export const CAMPUS_NODE_NAMES = CAMPUS_NODES.map((node) => node.name);

export function resolveNodeName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return null;
  }

  return NODE_LOOKUP.get(normalizedValue) ?? null;
}

export function getNodeDisplayName(nodeName: string): string {
  return nodeName.replace(/_/g, ' ');
}

export function findNodeMentions(value: string): NodeMention[] {
  const normalizedValue = normalizeText(value);
  const mentions: NodeMention[] = [];
  const occupiedRanges: Array<{ start: number; end: number }> = [];

  for (const alias of NODE_ALIASES_BY_LENGTH) {
    let searchIndex = 0;

    while (searchIndex < normalizedValue.length) {
      const startIndex = normalizedValue.indexOf(alias, searchIndex);

      if (startIndex === -1) {
        break;
      }

      const endIndex = startIndex + alias.length;
      const startsAtBoundary = startIndex === 0 || normalizedValue[startIndex - 1] === ' ';
      const endsAtBoundary = endIndex === normalizedValue.length || normalizedValue[endIndex] === ' ';
      const overlapsExisting = occupiedRanges.some(
        (range) => startIndex < range.end && endIndex > range.start
      );

      if (startsAtBoundary && endsAtBoundary && !overlapsExisting) {
        mentions.push({
          nodeName: NODE_LOOKUP.get(alias) ?? alias,
          startIndex,
          matchText: alias,
        });
        occupiedRanges.push({ start: startIndex, end: endIndex });
      }

      searchIndex = endIndex;
    }
  }

  return mentions.sort((left, right) => left.startIndex - right.startIndex);
}

export function uniqueNodeNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}
