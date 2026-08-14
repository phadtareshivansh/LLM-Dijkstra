export const SHARE_QUERY_PREFIX = '?';

export interface ShareLinkInput {
  origin: string;
  destination: string;
  avoidNodes: string[];
  waypoints?: string[];
}

/**
 * Builds a shareable URL for a route. Existing search parameters are dropped
 * (only origin/destination/avoid/waypoints are encoded) so the link always reflects the
 * current trip, independent of transient UI state.
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

  return url.toString();
}