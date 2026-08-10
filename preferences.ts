export const PREFERENCES_STORAGE_KEY = 'dijkstra-navigator-preferences';

export const DEFAULT_PREFERENCES = {
  viewMode: 'path',
  showEdgeWeights: true,
  speedMs: 920,
} as const;

export type ViewModePreference = 'path' | 'dijkstra';

export interface Preferences {
  viewMode: ViewModePreference;
  showEdgeWeights: boolean;
  speedMs: number;
}

export function loadPreferences(): Preferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);

    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }

    const parsed = JSON.parse(raw) as Partial<Preferences>;

    return {
      viewMode: parsed.viewMode === 'dijkstra' ? 'dijkstra' : 'path',
      showEdgeWeights:
        typeof parsed.showEdgeWeights === 'boolean' ? parsed.showEdgeWeights : DEFAULT_PREFERENCES.showEdgeWeights,
      speedMs:
        typeof parsed.speedMs === 'number' && Number.isFinite(parsed.speedMs)
          ? Math.min(3000, Math.max(200, Math.round(parsed.speedMs)))
          : DEFAULT_PREFERENCES.speedMs,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: Preferences): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable (private mode, quota); preferences are best-effort.
  }
}