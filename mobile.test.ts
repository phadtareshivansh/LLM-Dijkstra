import { describe, expect, it, vi } from 'vitest';
import { clampZoom, distanceBetweenPoints, pinchZoomTarget, vibrate, vibrateRouteStart } from './mobile';

describe('clampZoom', () => {
  it('clamps zoom into the allowed range', () => {
    expect(clampZoom(2, 0.78, 1.34)).toBe(1.34);
    expect(clampZoom(0.5, 0.78, 1.34)).toBe(0.78);
    expect(clampZoom(1.1, 0.78, 1.34)).toBe(1.1);
  });
});

describe('distanceBetweenPoints', () => {
  it('computes the Euclidean distance between two points', () => {
    expect(distanceBetweenPoints(0, 0, 3, 4)).toBe(5);
  });
});

describe('pinchZoomTarget', () => {
  it('scales zoom by the pinch ratio', () => {
    expect(pinchZoomTarget(100, 125, 1, 0.78, 1.34)).toBeCloseTo(1.25);
  });

  it('clamps the resulting zoom', () => {
    expect(pinchZoomTarget(100, 500, 1, 0.78, 1.34)).toBe(1.34);
    expect(pinchZoomTarget(100, 10, 1, 0.78, 1.34)).toBe(0.78);
  });

  it('keeps the current zoom when the start distance is degenerate', () => {
    expect(pinchZoomTarget(0, 5, 1.1, 0.78, 1.34)).toBe(1.1);
  });
});

describe('vibrate', () => {
  it('returns false when the platform does not support vibration', () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });

    expect(vibrateRouteStart()).toBe(false);
    expect(vibrate(20)).toBe(false);
  });

  it('delegates to navigator.vibrate when available', () => {
    const vibrateMock = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrateMock, configurable: true });

    expect(vibrateRouteStart()).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });
});