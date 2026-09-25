import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import {
  civilDayAt, prayerNames, scheduleForDay, timeLabel,
  type AlertPrayerId, type Place, type Preferences
} from './prayers';

export type NativeNotificationPermission =
  | 'unsupported'
  | 'prompt'
  | 'prompt-with-rationale'
  | 'granted'
  | 'denied';

export interface NativeScheduleSummary {
  scheduled: number;
  days: number;
  warning?: string;
}

const DAYS_TO_SCHEDULE = 5;
const PRAYER_IDS: AlertPrayerId[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_MARK = 'miqati-prayer';
const ADHAN_DEFAULT_SOUND = 'adhan_default_short.wav';
const ADHAN_FAJR_SOUND = 'adhan_fajr_short.wav';
const ANDROID_ADHAN_CHANNEL = 'miqati-adhan-v1';
const ANDROID_FAJR_CHANNEL = 'miqati-fajr-adhan-v1';
const ANDROID_SILENT_CHANNEL = 'miqati-silent-v1';

async function ensureAndroidChannels(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.createChannel({
    id: ANDROID_ADHAN_CHANNEL,
    name: 'أذان وقت الصلاة',
    description: 'مقطع أذان قصير عند دخول وقت الصلاة',
    sound: ADHAN_DEFAULT_SOUND,
    importance: 4,
    vibration: true
  });
  await LocalNotifications.createChannel({
    id: ANDROID_FAJR_CHANNEL,
    name: 'أذان الفجر',
    description: 'مقطع أذان قصير عند دخول وقت الفجر',
    sound: ADHAN_FAJR_SOUND,
    importance: 4,
    vibration: true
  });
  await LocalNotifications.createChannel({
    id: ANDROID_SILENT_CHANNEL,
    name: 'تنبيهات صامتة',
    description: 'تنبيهات ميقاتي بدون صوت',
    importance: 3,
    vibration: false
  });
}

function shiftedCivilDay(
  civil: { year: number; month: number; day: number },
  offset: number
): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + offset, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function notificationId(
  civil: { year: number; month: number; day: number },
  prayerIndex: number,
  phase: 0 | 1
): number {
  const dayNumber = Math.floor(Date.UTC(civil.year, civil.month - 1, civil.day) / 86_400_000);
  return dayNumber * 16 + prayerIndex * 2 + phase;
}

export function isNativeNotificationPlatform(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android';
}

export async function getNativeNotificationPermission(): Promise<NativeNotificationPermission> {
  if (!isNativeNotificationPlatform()) return 'unsupported';
  try {
    const status = await LocalNotifications.checkPermissions();
    return status.display as NativeNotificationPermission;
  } catch {
    return 'denied';
  }
}

export async function requestNativeNotificationPermission(): Promise<NativeNotificationPermission> {
  if (!isNativeNotificationPlatform()) return 'unsupported';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';
    const result = await LocalNotifications.requestPermissions();
    return result.display as NativeNotificationPermission;
  } catch {
    return 'denied';
  }
}

async function cancelPrayerNotifications(): Promise<number> {
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((item) => item.extra?.miqatiType === PRAYER_MARK);
  if (ours.length) {
    await LocalNotifications.cancel({
      notifications: ours.map((item) => ({ id: item.id }))
    });
  }
  return ours.length;
}

function makeNotification(
  id: number,
  at: Date,
  title: string,
  body: string,
  place: Place,
  prayerId: AlertPrayerId,
  phase: 'before5' | 'due',
  dateKey: string,
  preferences: Preferences
): LocalNotificationSchema {
  const platform = Capacitor.getPlatform();
  const dueSound = prayerId === 'fajr' ? ADHAN_FAJR_SOUND : ADHAN_DEFAULT_SOUND;
  const sound = preferences.soundOn
    ? (phase === 'due' ? dueSound : 'default')
    : undefined;
  const channelId = platform === 'android'
    ? (preferences.soundOn
        ? (phase === 'due'
            ? (prayerId === 'fajr' ? ANDROID_FAJR_CHANNEL : ANDROID_ADHAN_CHANNEL)
            : undefined)
        : ANDROID_SILENT_CHANNEL)
    : undefined;
  return {
    id,
    title,
    body,
    schedule: { at, allowWhileIdle: true },
    foreground: true,
    sound,
    channelId,
    interruptionLevel: preferences.soundOn ? 'active' : 'passive',
    isExactNotification: platform === 'android' ? true : undefined,
    autoCancel: platform === 'android' ? true : undefined,
    extra: {
      miqatiType: PRAYER_MARK,
      prayerId,
      phase,
      dateKey,
      placeName: place.name
    }
  };
}

export async function schedulePrayerNotifications(
  place: Place,
  preferences: Preferences,
  now = new Date()
): Promise<NativeScheduleSummary> {
  if (!isNativeNotificationPlatform()) return { scheduled: 0, days: 0 };

  const permission = await getNativeNotificationPermission();
  if (permission !== 'granted') return { scheduled: 0, days: 0 };

  await ensureAndroidChannels();
  await cancelPrayerNotifications();

  const startCivil = civilDayAt(now, place.timeZone);
  const notifications: LocalNotificationSchema[] = [];

  for (let dayOffset = 0; dayOffset < DAYS_TO_SCHEDULE; dayOffset += 1) {
    const civil = shiftedCivilDay(startCivil, dayOffset);
    const schedule = scheduleForDay(place, preferences, civil);

    for (const event of schedule.events) {
      if (event.id === 'sunrise') continue;
      const prayerId = event.id as AlertPrayerId;
      if (!preferences.alerts[prayerId] || !Number.isFinite(event.at.getTime())) continue;

      const prayerIndex = PRAYER_IDS.indexOf(prayerId);
      if (prayerIndex < 0) continue;

      const before = new Date(event.at.getTime() - 5 * 60_000);
      if (before.getTime() > now.getTime()) {
        notifications.push(makeNotification(
          notificationId(civil, prayerIndex, 0),
          before,
          `باقي ٥ دقائق على صلاة ${prayerNames[prayerId]}`,
          `${place.name} · وقت الصلاة ${timeLabel(event.at, place.timeZone)}`,
          place,
          prayerId,
          'before5',
          schedule.dateKey,
          preferences
        ));
      }

      if (event.at.getTime() > now.getTime()) {
        notifications.push(makeNotification(
          notificationId(civil, prayerIndex, 1),
          event.at,
          `حان وقت صلاة ${prayerNames[prayerId]}`,
          `بحسب ${place.name} · ${timeLabel(event.at, place.timeZone)}`,
          place,
          prayerId,
          'due',
          schedule.dateKey,
          preferences
        ));
      }
    }
  }

  if (!notifications.length) return { scheduled: 0, days: DAYS_TO_SCHEDULE };

  const result = await LocalNotifications.schedule({ notifications });
  return {
    scheduled: result.notifications.length,
    days: DAYS_TO_SCHEDULE,
    warning: result.warning?.message
  };
}

export async function testNativePrayerNotification(): Promise<boolean> {
  if (!isNativeNotificationPlatform()) return false;
  const permission = await getNativeNotificationPermission();
  if (permission !== 'granted') return false;

  const testId = 2_000_000_001;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: testId }] });
  } catch {
    // It is fine if a previous test notification did not exist.
  }

  await LocalNotifications.schedule({
    notifications: [{
      id: testId,
      title: 'اختبار تنبيه ميقاتي',
      body: 'التنبيهات المحلية تعمل على هذا الجهاز.',
      schedule: { at: new Date(Date.now() + 5_000), allowWhileIdle: true },
      foreground: true,
      sound: 'default',
      interruptionLevel: 'active',
      isExactNotification: Capacitor.getPlatform() === 'android' ? true : undefined,
      autoCancel: Capacitor.getPlatform() === 'android' ? true : undefined,
      extra: { miqatiType: 'miqati-test' }
    }]
  });
  return true;
}
