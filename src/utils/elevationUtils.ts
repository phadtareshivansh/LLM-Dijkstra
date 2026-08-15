import { Node } from '../data/themeConstants';

export interface ElevationPoint {
  node: string;
  elevation: number;
  step: number;
}

export interface ElevationStats {
  ascent: number;
  descent: number;
  net: number;
  min: number;
  max: number;
}

export function buildElevationProfile(path: string[], nodes: Node[]): ElevationPoint[] {
  const nodeLookup = new Map(nodes.map((node) => [node.name, node]));
  const profile: ElevationPoint[] = [];

  for (let step = 0; step < path.length; step += 1) {
    const node = nodeLookup.get(path[step]);

    if (!node) {
      continue;
    }

    profile.push({ node: node.name, elevation: node.elevation, step });
  }

  return profile;
}

export function elevationStats(profile: ElevationPoint[]): ElevationStats {
  if (profile.length === 0) {
    return { ascent: 0, descent: 0, net: 0, min: 0, max: 0 };
  }

  let ascent = 0;
  let descent = 0;
  let min = profile[0].elevation;
  let max = profile[0].elevation;

  for (let index = 1; index < profile.length; index += 1) {
    const delta = profile[index].elevation - profile[index - 1].elevation;

    if (delta > 0) {
      ascent += delta;
    } else {
      descent += -delta;
    }

    min = Math.min(min, profile[index].elevation);
    max = Math.max(max, profile[index].elevation);
  }

  const last = profile[profile.length - 1];

  return { ascent, descent, net: last.elevation - profile[0].elevation, min, max };
}