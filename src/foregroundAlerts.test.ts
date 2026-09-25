import { describe, expect, it } from 'vitest';
import {
  BEFORE_ALERT_WINDOW_MS,
  DUE_ALERT_GRACE_MS,
  shouldShowBeforeAlert,
  shouldShowDueAlert
} from './foregroundAlerts';

describe('foreground prayer alert windows', () => {
  const prayer = 1_000_000;

  it('keeps the five-minute reminder active for the full five-minute window', () => {
    expect(shouldShowBeforeAlert(prayer - BEFORE_ALERT_WINDOW_MS, prayer)).toBe(true);
    expect(shouldShowBeforeAlert(prayer - 30_000, prayer)).toBe(true);
    expect(shouldShowBeforeAlert(prayer, prayer)).toBe(false);
  });

  it('allows a five-minute catch-up window after prayer time', () => {
    expect(shouldShowDueAlert(prayer, prayer)).toBe(true);
    expect(shouldShowDueAlert(prayer + DUE_ALERT_GRACE_MS - 1, prayer)).toBe(true);
    expect(shouldShowDueAlert(prayer + DUE_ALERT_GRACE_MS, prayer)).toBe(false);
  });
});
