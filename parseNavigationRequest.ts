import { GoogleGenAI, Type } from '@google/genai';

export interface NavigationParseResult {
  origin: string | null;
  destination: string | null;
  avoid_nodes: string[];
}

const SYSTEM_PROMPT = [
  'You extract navigation parameters from a user request.',
  'Return only the structured fields defined by the schema.',
  'Do not add commentary, explanation, or extra keys.',
  'If a field is missing, use null for origin and destination and an empty array for avoid_nodes.',
].join(' ');

const NAVIGATION_RESPONSE_SCHEMA = {
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
} as const;

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

export async function parseNavigationRequest(userInput: string): Promise<NavigationParseResult> {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userInput,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: NAVIGATION_RESPONSE_SCHEMA,
    },
  });

  const rawText = response.text?.trim();

  if (!rawText) {
    throw new Error('Gemini returned an empty navigation response.');
  }

  return JSON.parse(rawText) as NavigationParseResult;
}
