import { CAMPUS_NODE_NAMES, findNodeMentions, resolveNodeName, uniqueNodeNames } from './navigationUtils';

export interface NavigationParseResult {
  origin: string | null;
  destination: string | null;
  avoid_nodes: string[];
}

const SYSTEM_PROMPT = [
  'You extract navigation parameters from a user request.',
  `Valid node names are: ${CAMPUS_NODE_NAMES.join(', ')}.`,
  'Normalize spaces, hyphens, and informal names to the closest valid node name.',
  'Return only the structured fields defined by the schema.',
  'Do not add commentary, explanation, or extra keys.',
  'If a field is missing, use null for origin and destination and an empty array for avoid_nodes.',
].join(' ');

const AVOID_KEYWORD_PATTERN = /\b(?:avoid(?:ing)?|without|skip(?:ping)?|exclude|except|not\s+via)\b/i;

export const GEMINI_REQUEST_TIMEOUT_MS = 15_000;

const PARSE_CACHE_KEY_PREFIX = 'dijkstra-navigator:parse:';
export const PARSE_CACHE_TTL_MS = 30 * 60 * 1000;
export const PARSE_CACHE_MAX_ENTRIES = 50;

interface CachedParseEntry {
  result: NavigationParseResult;
  timestamp: number;
}

function getCacheStore(): Storage | null {
  try {
    const storage = globalThis.localStorage;

    if (!storage) {
      return null;
    }

    storage.getItem('__storage_probe__');

    return storage;
  } catch {
    return null;
  }
}

function getCachedParse(input: string): NavigationParseResult | null {
  const store = getCacheStore();

  if (!store) {
    return null;
  }

  try {
    const rawEntry = store.getItem(PARSE_CACHE_KEY_PREFIX + input);

    if (!rawEntry) {
      return null;
    }

    const cached = JSON.parse(rawEntry) as CachedParseEntry;

    if (Date.now() - cached.timestamp > PARSE_CACHE_TTL_MS) {
      store.removeItem(PARSE_CACHE_KEY_PREFIX + input);
      return null;
    }

    return sanitizeNavigationParseResult(cached.result);
  } catch {
    return null;
  }
}

function parseCachedEntry(store: Storage, key: string): CachedParseEntry | null {
  try {
    const rawEntry = store.getItem(key);

    if (!rawEntry) {
      return null;
    }

    return JSON.parse(rawEntry) as CachedParseEntry;
  } catch {
    return null;
  }
}

/**
 * Removes expired entries and evicts the oldest entries when the cache grows
 * beyond PARSE_CACHE_MAX_ENTRIES, so the parse cache cannot grow unboundedly.
 * Keys are collected before any removal to avoid index shifts during iteration.
 */
function evictStaleCacheEntries(store: Storage): void {
  const keys: string[] = [];

  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);

    if (key?.startsWith(PARSE_CACHE_KEY_PREFIX)) {
      keys.push(key);
    }
  }

  const now = Date.now();
  const entries: Array<{ key: string; timestamp: number }> = [];

  for (const key of keys) {
    const cached = parseCachedEntry(store, key);

    if (!cached || now - cached.timestamp > PARSE_CACHE_TTL_MS) {
      store.removeItem(key);
      continue;
    }

    entries.push({ key, timestamp: cached.timestamp });
  }

  if (entries.length <= PARSE_CACHE_MAX_ENTRIES) {
    return;
  }

  const entriesToRemove = entries
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, entries.length - PARSE_CACHE_MAX_ENTRIES);

  for (const entry of entriesToRemove) {
    store.removeItem(entry.key);
  }
}

function setCachedParse(input: string, result: NavigationParseResult): void {
  const store = getCacheStore();

  if (!store) {
    return;
  }

  try {
    const entry: CachedParseEntry = {
      result,
      timestamp: Date.now(),
    };
    store.setItem(PARSE_CACHE_KEY_PREFIX + input, JSON.stringify(entry));
    evictStaleCacheEntries(store);
  } catch {
    // Caching is best-effort; a full or blocked store must never break parsing.
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Gemini request timed out.'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function getGeminiApiKey(): string {
  const viteKey = (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GEMINI_API_KEY : undefined) as
    | string
    | undefined;

  if (!viteKey) {
    throw new Error('Missing Gemini API key. Set VITE_GEMINI_API_KEY.');
  }

  return viteKey;
}

function firstNodeMention(value: string): string | null {
  return findNodeMentions(value)[0]?.nodeName ?? null;
}

function splitAvoidClause(userInput: string): { routeText: string; avoidText: string } {
  const match = AVOID_KEYWORD_PATTERN.exec(userInput);

  if (!match || match.index < 0) {
    return {
      routeText: userInput,
      avoidText: '',
    };
  }

  return {
    routeText: userInput.slice(0, match.index),
    avoidText: userInput.slice(match.index + match[0].length),
  };
}

function parseNavigationRequestLocally(userInput: string): NavigationParseResult {
  const { routeText: splitRouteText, avoidText } = splitAvoidClause(userInput);
  const routeText = splitRouteText.trim() ? splitRouteText : userInput;
  let origin: string | null = null;
  let destination: string | null = null;

  const fromToMatch = /\bfrom\s+(.+?)\s+(?:to|towards?|until)\s+(.+)$/i.exec(routeText);

  if (fromToMatch) {
    origin = firstNodeMention(fromToMatch[1]);
    destination = firstNodeMention(fromToMatch[2]);
  }

  if (!origin) {
    const originMatch = /\b(?:from|start(?:ing)?(?:\s+at)?|source)\s+(.+?)(?=\s+(?:to|towards?|destination|target|end|finish|avoid|without|skip|except)\b|$)/i.exec(
      routeText
    );
    origin = originMatch ? firstNodeMention(originMatch[1]) : null;
  }

  if (!destination) {
    const destinationMatch = /\b(?:to|towards?|destination|target|end(?:\s+at)?|finish(?:\s+at)?)\s+(.+?)(?=\s+(?:avoid|without|skip|except)\b|$)/i.exec(
      routeText
    );
    destination = destinationMatch ? firstNodeMention(destinationMatch[1]) : null;
  }

  const endpointSet = new Set([origin, destination].filter((value): value is string => Boolean(value)));

  const avoidNodes = uniqueNodeNames(
    findNodeMentions(avoidText)
      .map((mention) => mention.nodeName)
      .filter((nodeName) => !endpointSet.has(nodeName))
  );

  if (!origin || !destination) {
    const routeMentions = uniqueNodeNames(findNodeMentions(routeText).map((mention) => mention.nodeName)).filter(
      (nodeName) => !avoidNodes.includes(nodeName)
    );

    if (!origin && routeMentions.length >= 2) {
      origin = routeMentions[0];
    }

    if (!destination) {
      if (routeMentions.length >= 2) {
        destination = routeMentions[1];
      } else if (!origin && routeMentions.length === 1) {
        destination = routeMentions[0];
      }
    }
  }

  return {
    origin,
    destination,
    avoid_nodes: avoidNodes,
  };
}

function sanitizeNavigationParseResult(parsed: NavigationParseResult): NavigationParseResult {
  return {
    origin: resolveNodeName(parsed.origin),
    destination: resolveNodeName(parsed.destination),
    avoid_nodes: uniqueNodeNames(
      parsed.avoid_nodes
        .map((nodeName) => resolveNodeName(nodeName))
        .filter((nodeName): nodeName is string => Boolean(nodeName))
    ),
  };
}

function mergeParseResults(primary: NavigationParseResult, fallback: NavigationParseResult): NavigationParseResult {
  return {
    origin: primary.origin ?? fallback.origin,
    destination: primary.destination ?? fallback.destination,
    avoid_nodes: uniqueNodeNames([...primary.avoid_nodes, ...fallback.avoid_nodes]),
  };
}

async function parseWithGemini(userInput: string): Promise<NavigationParseResult> {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  const request = ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userInput,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        additionalProperties: false,
        properties: {
          origin: {
            type: Type.STRING,
            nullable: true,
            description: 'Starting campus node name, or null when not provided.',
          },
          destination: {
            type: Type.STRING,
            nullable: true,
            description: 'Ending campus node name, or null when not provided.',
          },
          avoid_nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: 'Campus nodes to avoid while navigating.',
          },
        },
        required: ['origin', 'destination', 'avoid_nodes'],
      },
    },
  });

  const response = await withTimeout(request, GEMINI_REQUEST_TIMEOUT_MS);

  const rawText = response.text?.trim();

  if (!rawText) {
    throw new Error('Gemini returned an empty navigation response.');
  }

  return sanitizeNavigationParseResult(JSON.parse(rawText) as NavigationParseResult);
}

export async function parseNavigationRequest(userInput: string): Promise<NavigationParseResult> {
  const cachedParse = getCachedParse(userInput);

  if (cachedParse) {
    return cachedParse;
  }

  const fallbackParse = parseNavigationRequestLocally(userInput);
  let parseResult: NavigationParseResult;

  try {
    const geminiParse = await parseWithGemini(userInput);
    parseResult = mergeParseResults(geminiParse, fallbackParse);
  } catch {
    parseResult = fallbackParse;
  }

  setCachedParse(userInput, parseResult);

  return parseResult;
}
