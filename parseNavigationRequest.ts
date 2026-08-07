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

function getGeminiApiKey(): string {
  const environment = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
    import?: never;
  };

  const nextKey = environment.process?.env?.NEXT_PUBLIC_GEMINI_API_KEY;
  const viteKey = (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GEMINI_API_KEY : undefined) as
    | string
    | undefined;

  const apiKey = nextKey ?? viteKey;

  if (!apiKey) {
    throw new Error('Missing Gemini API key. Set NEXT_PUBLIC_GEMINI_API_KEY or VITE_GEMINI_API_KEY.');
  }

  return apiKey;
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
  const { routeText, avoidText } = splitAvoidClause(userInput);
  const avoidNodes = uniqueNodeNames(findNodeMentions(avoidText).map((mention) => mention.nodeName));
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

  const response = await ai.models.generateContent({
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

  const rawText = response.text?.trim();

  if (!rawText) {
    throw new Error('Gemini returned an empty navigation response.');
  }

  return sanitizeNavigationParseResult(JSON.parse(rawText) as NavigationParseResult);
}

export async function parseNavigationRequest(userInput: string): Promise<NavigationParseResult> {
  const fallbackParse = parseNavigationRequestLocally(userInput);

  try {
    const geminiParse = await parseWithGemini(userInput);
    return mergeParseResults(geminiParse, fallbackParse);
  } catch {
    return fallbackParse;
  }
}
