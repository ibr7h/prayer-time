import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  prayerNames, timeLabel,
  type AlertPrayerId, type DaySchedule, type Place, type Preferences
} from './prayers';

export type NativeNotificationStatus = {
  display: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unsupported';
  exact: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unsupported';
};

const DEFAULT_CHANNEL = 'miqati_adhan_v2';
const FAJR_CHANNEL = 'miqati_fajr_v2';
const SILENT_CHANNEL = 'miqati_silent_v2';
const prayerIndex: Record<AlertPrayerId, number> = {
  fajr: 1,
  dhuhr: 2,
  asr: 3,
  maghrib: 4,
  isha: 5
};

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function ensureChannels() {
  await LocalNotifications.createChannel({
    id: DEFAULT_CHANNEL,
    name: 'الأذان',
    description: 'تنبيهات الصلوات بصوت الأذان',
    sound: 'adhan_default.mp3',
    importance: 5,
    visibility: 1,
    vibration: true
  });
  await LocalNotifications.createChannel({
    id: FAJR_CHANNEL,
    name: 'أذان الفجر',
    description: 'تنبيه صلاة الفجر بصوت أذان الفجر',
    sound: 'adhan_fajr.mp3',
    importance: 5,
    visibility: 1,
    vibration: true
  });
  await LocalNotifications.createChannel({
    id: SILENT_CHANNEL,
    name: 'تنبيهات صامتة',
    description: 'تنبيه الصلاة دون صوت',
    importance: 4,
    visibility: 1,
    vibration: false
  });
}

export async function readNativeNotificationStatus(): Promise<NativeNotificationStatus> {
  if (!isNativeAndroid()) return { display: 'unsupported', exact: 'unsupported' };
  const [display, exact] = await Promise.all([
    LocalNotifications.checkPermissions(),
    LocalNotifications.checkExactNotificationSetting()
  ]);
  return { display: display.display, exact: exact.exact_alarm };
}

export async function requestNativeNotificationAccess(): Promise<NativeNotificationStatus> {
  if (!isNativeAndroid()) return { display: 'unsupported', exact: 'unsupported' };
  const display = await LocalNotifications.requestPermissions();
  let exact = await LocalNotifications.checkExactNotificationSetting();
  if (display.display === 'granted' && exact.exact_alarm !== 'granted') {
    await LocalNotifications.changeExactNotificationSetting();
    exact = await LocalNotifications.checkExactNotificationSetting();
  }
  return { display: display.display, exact: exact.exact_alarm };
}

function notificationId(dateKey: string, prayer: AlertPrayerId): number {
  const compactDate = Number(dateKey.replace(/\D/g, ''));
  return compactDate * 10 + prayerIndex[prayer];
}

export async function syncNativePrayerNotifications(
  today: DaySchedule,
  tomorrow: DaySchedule,
  place: Place,
  preferences: Preferences
): Promise<{ scheduled: number; warning?: string }> {
  if (!isNativeAndroid()) return { scheduled: 0 };

  const status = await readNativeNotificationStatus();
  if (status.display !== 'granted') return { scheduled: 0, warning: 'notification-permission' };
  if (status.exact !== 'granted') return { scheduled: 0, warning: 'exact-alarm-permission' };

  await ensureChannels();
  await LocalNotifications.cancelAll();

  const now = Date.now();
  const notifications = [today, tomorrow].flatMap((day) =>
    day.events.flatMap((event) => {
      if (event.id === 'sunrise') return [];
      const id = event.id as AlertPrayerId;
      if (!preferences.alerts[id] || !Number.isFinite(event.at.getTime()) || event.at.getTime() <= now + 1000) return [];
      const channelId = !preferences.soundOn
        ? SILENT_CHANNEL
        : id === 'fajr' ? FAJR_CHANNEL : DEFAULT_CHANNEL;
      return [{
        id: notificationId(day.dateKey, id),
        title: `حان وقت صلاة ${prayerNames[id]}`,
        body: `${place.name} · ${timeLabel(event.at, place.timeZone)}`,
        channelId,
        foreground: true,
        schedule: { at: event.at, allowWhileIdle: true },
        isExactNotification: true,
        isExactMandatory: true,
        extra: { prayerId: id, dateKey: day.dateKey }
      }];
    })
  );

  if (!notifications.length) return { scheduled: 0 };
  const result = await LocalNotifications.schedule({ notifications });
  return { scheduled: notifications.length, warning: result.warning?.message };
}
