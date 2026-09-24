import { describe, expect, it } from 'vitest';
import { animateHeadingStep, headingFromOrientation, normalizeDegrees, signedBearingDelta, smoothSensorHeading } from './QiblaCompass';

describe('qibla compass math', () => {
  it('normalizes headings into a 0-359 degree range', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-10)).toBe(350);
  });

  it('returns the shortest signed turn toward the qibla', () => {
    expect(signedBearingDelta(328, 328)).toBe(0);
    expect(signedBearingDelta(10, 350)).toBe(20);
    expect(signedBearingDelta(350, 10)).toBe(-20);
    expect(signedBearingDelta(180, 0)).toBe(-180);
  });

  it('prefers the iOS compass heading and converts absolute alpha when needed', () => {
    const ios = headingFromOrientation({
      webkitCompassHeading: 275,
      webkitCompassAccuracy: 8,
      absolute: false,
      alpha: null,
      beta: 0,
      gamma: 0
    } as DeviceOrientationEvent & { webkitCompassHeading: number; webkitCompassAccuracy: number });
    expect(ios?.heading).toBe(275);
    expect(ios?.accuracy).toBe(8);

    const absolute = headingFromOrientation({
      absolute: true,
      alpha: 90,
      beta: 0,
      gamma: 0
    } as DeviceOrientationEvent);
    expect(absolute?.heading).toBe(270);
  });

  it('smooths noisy sensor readings while remaining responsive to real turns', () => {
    expect(smoothSensorHeading(100, 100.2, 8)).toBe(100);
    expect(smoothSensorHeading(100, 102, 8)).toBeGreaterThan(100);
    expect(smoothSensorHeading(100, 102, 8)).toBeLessThan(102);
    expect(smoothSensorHeading(350, 10, 8)).toBeGreaterThan(350);
  });

  it('animates toward the target in bounded steps and respects the circular boundary', () => {
    const first = animateHeadingStep(100, 130, 8);
    expect(first).toBeGreaterThan(100);
    expect(first).toBeLessThanOrEqual(104.5);

    const wrapped = animateHeadingStep(359, 1, 8);
    expect(wrapped).toBeGreaterThan(359);
    expect(wrapped).toBeLessThan(360);
  });
});
