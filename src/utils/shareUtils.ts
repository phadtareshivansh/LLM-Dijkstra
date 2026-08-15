export interface ShareLinkInput {
  origin: string;
  destination: string;
  avoidNodes: string[];
  waypoints?: string[];
  algorithm?: string;
  softAvoidance?: boolean;
  accessibleOnly?: boolean;
  timeOfDay?: string;
  speedMs?: number;
}

/**
 * Builds a shareable URL for a route. Existing search parameters are dropped
 * (only the route and its settings are encoded) so the link always reflects
 * the current trip, independent of transient UI state.
 */
export function buildShareUrl(baseUrl: string, options: ShareLinkInput): string {
  const url = new URL(baseUrl);
  url.search = '';

  url.searchParams.set('origin', options.origin);
  url.searchParams.set('destination', options.destination);

  if (options.avoidNodes.length > 0) {
    url.searchParams.set('avoid', options.avoidNodes.join(','));
  }

  if (options.waypoints && options.waypoints.length > 0) {
    url.searchParams.set('waypoints', options.waypoints.join(','));
  }

  if (options.algorithm) {
    url.searchParams.set('algorithm', options.algorithm);
  }

  if (options.softAvoidance) {
    url.searchParams.set('softAvoidance', 'true');
  }

  if (options.accessibleOnly) {
    url.searchParams.set('accessibleOnly', 'true');
  }

  if (options.timeOfDay) {
    url.searchParams.set('timeOfDay', options.timeOfDay);
  }

  if (options.speedMs !== undefined) {
    url.searchParams.set('speed', String(options.speedMs));
  }

  return url.toString();
}