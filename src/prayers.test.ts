import { describe, expect, it } from 'vitest';
import { cityPresets, civilDayAt, defaultPreferences, nextPrayer, scheduleForDay, secondsUntil, todayAndTomorrow, type Place } from './prayers';

const mecca = cityPresets[0];

describe('local prayer schedules', () => {
  it('uses the place timezone for the civil day, not the device timezone', () => {
    expect(civilDayAt(new Date('2026-09-13T21:30:00Z'), 'Asia/Riyadh'))
      .toEqual({ year: 2026, month: 9, day: 14 });
  });

  it('computes ordered prayer events with a readable date key', () => {
    const day = scheduleForDay(mecca, defaultPreferences, { year: 2026, month: 9, day: 13 });
    expect(day.dateKey).toBe('2026-09-13');
    expect(day.events.map((event) => event.id)).toEqual(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);
    expect(day.events.every((event) => Number.isFinite(event.at.getTime()))).toBe(true);
    expect(day.events.every((event, index, list) => index === 0 || event.at > list[index - 1].at)).toBe(true);
  });

  it('selects tomorrow Fajr after today Isha and never treats sunrise as prayer', () => {
    const place = mecca;
    const { today, tomorrow } = todayAndTomorrow(place, defaultPreferences, new Date('2026-09-13T12:00:00Z'));
    const afterIsha = new Date(today.events.find(({ id }) => id === 'isha')!.at.getTime() + 1000);
    expect(nextPrayer(today, tomorrow, afterIsha)?.id).toBe('fajr');
    const afterFajr = new Date(today.events.find(({ id }) => id === 'fajr')!.at.getTime() + 1000);
    expect(nextPrayer(today, tomorrow, afterFajr)?.id).toBe('dhuhr');
  });

  it('changes times with location and applies user minute adjustment', () => {
    const date = { year: 2026, month: 9, day: 13 };
    const distant: Place = { ...mecca, name: 'الرياض', latitude: 24.7136, longitude: 46.6753 };
    const original = scheduleForDay(mecca, defaultPreferences, date);
    const moved = scheduleForDay(distant, defaultPreferences, date);
    const adjusted = scheduleForDay(mecca, { ...defaultPreferences, adjustment: 3 }, date);
    expect(moved.events[0].at.getTime()).not.toBe(original.events[0].at.getTime());
    expect(adjusted.events[2].at.getTime() - original.events[2].at.getTime()).toBe(3 * 60_000);
    expect(adjusted.events[1].at.getTime()).toBe(original.events[1].at.getTime());
  });

  it('never displays a negative countdown', () => {
    expect(secondsUntil(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T01:00:00Z'))).toBe(0);
  });
});
