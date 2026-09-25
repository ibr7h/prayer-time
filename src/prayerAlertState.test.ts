import { describe, expect, it } from 'vitest';
import { prayerAlertMarkKey } from './prayerAlertState';

describe('prayer alert mark separation', () => {
  it('keeps visible due alert and successful adhan as different marks', () => {
    const date = '2026-09-25';
    expect(prayerAlertMarkKey(date, 'dueAlert', 'dhuhr'))
      .not.toBe(prayerAlertMarkKey(date, 'adhanStarted', 'dhuhr'));
  });

  it('uses an explicit success-only adhanStarted phase', () => {
    expect(prayerAlertMarkKey('2026-09-25', 'adhanStarted', 'dhuhr'))
      .toBe('2026-09-25|adhanStarted|dhuhr');
  });
});
