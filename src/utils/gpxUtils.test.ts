import { describe, expect, it } from 'vitest';
import { buildGpx, gridToLatLon } from './gpxUtils';
import { CAMPUS_NODES } from '../data/themeConstants';

describe('gridToLatLon', () => {
  it('maps the 0-100 grid onto a small geographic span', () => {
    expect(gridToLatLon({ x: 85, y: 40 })).toEqual({ lat: 19.0768, lon: 72.8794 });
  });

  it('maps the grid origin to the bottom-left', () => {
    expect(gridToLatLon({ x: 0, y: 0 })).toEqual({ lat: 19.076, lon: 72.8777 });
  });

  it('respects a custom origin and span', () => {
    expect(gridToLatLon({ x: 50, y: 50 }, 10, 20, 1)).toEqual({ lat: 10.5, lon: 20.5 });
  });
});

describe('buildGpx', () => {
  it('emits waypoints and a track for every node on the path', () => {
    const gpx = buildGpx(['Main_Gate', 'Science_Lab', 'Library'], CAMPUS_NODES);

    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<wpt lat="19.0768" lon="72.8794"><name>Main_Gate</name></wpt>');
    expect(gpx).toContain('<trkpt lat="19.0771" lon="72.8787"><name>Science_Lab</name><ele>34</ele></trkpt>');
    expect(gpx).toContain('<trk><name>');
    expect(gpx).toContain('</trkseg></trk></gpx>');
  });

  it('includes the route name and distance in metadata', () => {
    const gpx = buildGpx(['Main_Gate', 'Library'], CAMPUS_NODES, { name: 'Campus <tour>', distance: 8 });

    expect(gpx).toContain('<metadata><name>Campus &lt;tour&gt;</name><desc>Total distance: 8 units</desc></metadata>');
  });

  it('omits the distance description when no distance is given', () => {
    const gpx = buildGpx(['Library'], CAMPUS_NODES);

    expect(gpx).not.toContain('<desc>');
  });

  it('skips node names that are not in the graph', () => {
    const gpx = buildGpx(['Main_Gate', 'Nowhere', 'Library'], CAMPUS_NODES);

    expect(gpx).not.toContain('Nowhere');
    expect(gpx).toContain('<name>Main_Gate</name>');
    expect(gpx).toContain('<name>Library</name>');
  });
});