import { Node } from '../data/themeConstants';
import { buildElevationProfile } from './elevationUtils';

const GRID_ORIGIN_LAT = 19.076;
const GRID_ORIGIN_LON = 72.8777;
const GRID_SPAN = 0.002;

export function gridToLatLon(
  node: Pick<Node, 'x' | 'y'>,
  originLat = GRID_ORIGIN_LAT,
  originLon = GRID_ORIGIN_LON,
  span = GRID_SPAN
): { lat: number; lon: number } {
  const lat = originLat + (node.y / 100) * span;
  const lon = originLon + (node.x / 100) * span;
  return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}

export function buildGpx(
  routePath: string[],
  nodes: Node[],
  options: { name?: string; distance?: number } = {}
): string {
  const nodeLookup = new Map(nodes.map((node) => [node.name, node]));
  const waypoints = routePath
    .map((name) => nodeLookup.get(name))
    .filter((node): node is Node => Boolean(node))
    .map((node) => {
      const { lat, lon } = gridToLatLon(node);
      return `<wpt lat="${lat}" lon="${lon}"><name>${escapeXml(node.name)}</name></wpt>`;
    })
    .join('');

  const elevationProfile = buildElevationProfile(routePath, nodes);
  const elevationByNode = new Map(elevationProfile.map(({ node, elevation }) => [node, elevation]));

  const tracks = routePath
    .map((name) => nodeLookup.get(name))
    .filter((node): node is Node => Boolean(node))
    .map((node) => {
      const { lat, lon } = gridToLatLon(node);
      const elevation = elevationByNode.get(node.name);
      return `<trkpt lat="${lat}" lon="${lon}"><name>${escapeXml(node.name)}</name>${elevation !== undefined ? `<ele>${elevation}</ele>` : ''}</trkpt>`;
    })
    .join('');

  const name = options.name ?? 'Dijkstra Navigator route';
  const distanceNote =
    typeof options.distance === 'number' && Number.isFinite(options.distance)
      ? `<desc>Total distance: ${options.distance} units</desc>`
      : '';

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<gpx version="1.1" creator="Dijkstra Navigator" xmlns="http://www.topografix.com/GPX/1/1">' +
    `<metadata><name>${escapeXml(name)}</name>${distanceNote}</metadata>` +
    waypoints +
    `<trk><name>${escapeXml(name)}</name><trkseg>${tracks}</trkseg></trk>` +
    '</gpx>'
  );
}

export function downloadGpx(
  routePath: string[],
  nodes: Node[],
  options: { name?: string; distance?: number; filename?: string } = {}
): void {
  const gpx = buildGpx(routePath, nodes, options);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = options.filename ?? 'route.gpx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
