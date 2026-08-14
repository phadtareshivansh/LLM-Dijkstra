export function clampZoom(zoom: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, zoom));
}

export function distanceBetweenPoints(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function pinchZoomTarget(
  startDistance: number,
  currentDistance: number,
  startZoom: number,
  min: number,
  max: number
): number {
  if (startDistance <= 0) {
    return clampZoom(startZoom, min, max);
  }

  return clampZoom(startZoom * (currentDistance / startDistance), min, max);
}

export function vibrate(pattern: number | number[]): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }

  return navigator.vibrate(pattern);
}

export function vibrateRouteStart(): boolean {
  return vibrate(10);
}

export function vibrateRouteComplete(): boolean {
  return vibrate([18, 50, 18]);
}