import { describe, expect, it } from 'vitest';
import { headingFromOrientation, normalizeDegrees, signedBearingDelta } from './QiblaCompass';

describe('qibla compass math', () => {
  it('normalizes headings into a 0-359 degree range', () => {
    expect(normalizeDegrees(370)).toBe(10);
    expect(normalizeDegrees(-10)).toBe(350);
  });

  it('returns the shortest signed turn toward the qibla', () => {
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
});
