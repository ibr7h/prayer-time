import { defaultPreferences, type Place, type Preferences } from './prayers';

const key = 'miqati:settings:v1';
export const MIQATI_STATE_SAVED_EVENT = 'miqati:state-saved';

export interface StoredState { place: Place | null; preferences: Preferences }

export function loadState(): StoredState {
  const initial: StoredState = { place: null, preferences: defaultPreferences };
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object') return initial;
    const candidate = saved.place;
    const validTimeZone = (zone: unknown) => {
      if (typeof zone !== 'string') return false;
      try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
    };
    const place: Place | null = candidate &&
      typeof candidate.name === 'string' &&
      Number.isFinite(candidate.latitude) && Math.abs(candidate.latitude) <= 90 &&
      Number.isFinite(candidate.longitude) && Math.abs(candidate.longitude) <= 180 &&
      validTimeZone(candidate.timeZone)
      ? candidate : null;
    const settings = saved.preferences ?? {};
    const method = ['ummAlQura', 'muslimWorldLeague', 'egyptian'].includes(settings.method)
      ? settings.method : defaultPreferences.method;
    const adjustment = Number.isInteger(settings.adjustment) && Math.abs(settings.adjustment) <= 30
      ? settings.adjustment : 0;
    return {
      place,
      preferences: {
        method,
        madhab: settings.madhab === 'hanafi' ? 'hanafi' : 'shafi',
        adjustment,
        soundOn: settings.soundOn !== false,
        alerts: {
          fajr: settings.alerts?.fajr !== false,
          dhuhr: settings.alerts?.dhuhr !== false,
          asr: settings.alerts?.asr !== false,
          maghrib: settings.alerts?.maghrib !== false,
          isha: settings.alerts?.isha !== false
        }
      }
    };
  } catch {
    return initial;
  }
}

export function saveState(state: StoredState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(MIQATI_STATE_SAVED_EVENT));
  } catch { /* private mode or full storage */ }
}
