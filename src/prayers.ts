import { CalculationMethod, Coordinates, Madhab, PrayerTimes, Qibla } from 'adhan';

export const prayerNames = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء'
} as const;

export type PrayerId = keyof typeof prayerNames;
export type AlertPrayerId = Exclude<PrayerId, 'sunrise'>;
export type MethodId = 'ummAlQura' | 'muslimWorldLeague' | 'egyptian';
export type MadhabId = 'shafi' | 'hanafi';

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
  source: 'gps' | 'city' | 'coordinates';
  updatedAt: number;
  accuracy?: number;
}

export interface Preferences {
  method: MethodId;
  madhab: MadhabId;
  adjustment: number;
  soundOn: boolean;
  alerts: Record<AlertPrayerId, boolean>;
}

export const defaultPreferences: Preferences = {
  method: 'ummAlQura',
  madhab: 'shafi',
  adjustment: 0,
  soundOn: true,
  alerts: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }
};

export const cityPresets: Place[] = [
  { name: 'مكة المكرمة', latitude: 21.4225, longitude: 39.8262 },
  { name: 'جدة', latitude: 21.5433, longitude: 39.1728 },
  { name: 'المدينة المنورة', latitude: 24.4672, longitude: 39.6112 },
  { name: 'الرياض', latitude: 24.7136, longitude: 46.6753 },
  { name: 'جازان', latitude: 16.8892, longitude: 42.5511 },
  { name: 'أبها', latitude: 18.2164, longitude: 42.5053 },
  { name: 'الدمام', latitude: 26.4207, longitude: 50.0888 },
  { name: 'الطائف', latitude: 21.2703, longitude: 40.4158 },
  { name: 'تبوك', latitude: 28.3838, longitude: 36.5550 }
].map((city) => ({ ...city, timeZone: 'Asia/Riyadh', source: 'city' as const, updatedAt: 0 }));

export interface PrayerEvent {
  id: PrayerId;
  at: Date;
}

export interface DaySchedule {
  dateKey: string;
  events: PrayerEvent[];
}

const orderedIds: PrayerId[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

export function civilDayAt(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function isRamadan(year: number, month: number, day: number): boolean {
  try {
    // Noon UTC avoids a day shift for Saudi Arabia, where this method is intended.
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    const hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      month: 'numeric',
      timeZone: 'Asia/Riyadh'
    }).format(date);
    return Number(hijri) === 9;
  } catch {
    return false;
  }
}

export function scheduleForDay(
  place: Place,
  preferences: Preferences,
  civil: { year: number; month: number; day: number }
): DaySchedule {
  const date = new Date(civil.year, civil.month - 1, civil.day);
  const params = preferences.method === 'ummAlQura'
    ? CalculationMethod.UmmAlQura()
    : preferences.method === 'egyptian'
      ? CalculationMethod.Egyptian()
      : CalculationMethod.MuslimWorldLeague();

  params.madhab = preferences.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  const adjustment = preferences.adjustment;
  params.adjustments = {
    fajr: adjustment,
    sunrise: 0,
    dhuhr: adjustment,
    asr: adjustment,
    maghrib: adjustment,
    isha: adjustment + (preferences.method === 'ummAlQura' && isRamadan(civil.year, civil.month, civil.day) ? 30 : 0)
  };

  const times = new PrayerTimes(new Coordinates(place.latitude, place.longitude), date, params);
  return {
    dateKey: `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(civil.day).padStart(2, '0')}`,
    events: orderedIds.map((id) => ({ id, at: times[id] }))
  };
}

export function todayAndTomorrow(place: Place, preferences: Preferences, now: Date) {
  const civil = civilDayAt(now, place.timeZone);
  const next = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + 1, 12));
  const nextCivil = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  return {
    today: scheduleForDay(place, preferences, civil),
    tomorrow: scheduleForDay(place, preferences, nextCivil)
  };
}

export function nextPrayer(today: DaySchedule, tomorrow: DaySchedule, now: Date) {
  return [...today.events, ...tomorrow.events].find(
    ({ id, at }) => id !== 'sunrise' && Number.isFinite(at?.getTime()) && at.getTime() > now.getTime()
  ) ?? null;
}

export function secondsUntil(target: Date, now: Date): number {
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 1000));
}

export function timeLabel(date: Date, timeZone: string): string {
  if (!Number.isFinite(date?.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone
  }).format(date);
}

export function qiblaBearing(place: Place): number {
  return Math.round(Qibla(new Coordinates(place.latitude, place.longitude)));
}
