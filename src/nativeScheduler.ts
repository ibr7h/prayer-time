import { civilDayAt, scheduleForDay } from './prayers';
import { loadState, MIQATI_STATE_SAVED_EVENT } from './storage';
import {
  isNativeAndroid,
  readNativeNotificationStatus,
  requestNativeNotificationAccess,
  syncNativePrayerNotifications
} from './nativeNotifications';

const sessionPromptKey = 'miqati:native-notification-prompt:v2';
let syncing = false;

function schedulesForNextWeek() {
  const state = loadState();
  if (!state.place) return null;
  const civil = civilDayAt(new Date(), state.place.timeZone);
  const days = Array.from({ length: 7 }, (_, index) => {
    const noonUtc = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + index, 12));
    return scheduleForDay(state.place!, state.preferences, {
      year: noonUtc.getUTCFullYear(),
      month: noonUtc.getUTCMonth() + 1,
      day: noonUtc.getUTCDate()
    });
  });
  return { ...state, days };
}

async function refreshNativeSchedule(allowPrompt: boolean) {
  if (!isNativeAndroid() || syncing) return;
  const prepared = schedulesForNextWeek();
  if (!prepared) return;

  syncing = true;
  try {
    let status = await readNativeNotificationStatus();
    const needsAccess = status.display !== 'granted' || status.exact !== 'granted';
    if (needsAccess && allowPrompt && sessionStorage.getItem(sessionPromptKey) !== '1') {
      sessionStorage.setItem(sessionPromptKey, '1');
      status = await requestNativeNotificationAccess();
    }
    if (status.display === 'granted' && status.exact === 'granted') {
      const result = await syncNativePrayerNotifications(
        prepared.days,
        prepared.place!,
        prepared.preferences
      );
      console.info(`[Miqati] scheduled ${result.scheduled} native prayer alerts`, result.warning ?? '');
    } else {
      console.warn('[Miqati] native prayer alerts are not active until notification and exact-alarm permissions are granted.', status);
    }
  } catch (error) {
    console.error('[Miqati] failed to schedule native prayer alerts', error);
  } finally {
    syncing = false;
  }
}

export function startNativePrayerScheduler() {
  if (!isNativeAndroid()) return;

  void refreshNativeSchedule(true);

  window.addEventListener(MIQATI_STATE_SAVED_EVENT, () => {
    void refreshNativeSchedule(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshNativeSchedule(false);
  });

  window.setInterval(() => void refreshNativeSchedule(false), 60 * 60 * 1000);
}
