export const BEFORE_ALERT_WINDOW_MS = 5 * 60_000;
export const DUE_ALERT_GRACE_MS = 5 * 60_000;

export function shouldShowBeforeAlert(currentTime: number, prayerTime: number): boolean {
  const beforeTime = prayerTime - BEFORE_ALERT_WINDOW_MS;
  return currentTime >= beforeTime && currentTime < prayerTime;
}

export function shouldShowDueAlert(currentTime: number, prayerTime: number): boolean {
  return currentTime >= prayerTime && currentTime < prayerTime + DUE_ALERT_GRACE_MS;
}
