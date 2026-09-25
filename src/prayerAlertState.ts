export type PrayerAlertPhase = 'before5' | 'dueAlert' | 'adhanStarted';

export function prayerAlertMarkKey(dateKey: string, phase: PrayerAlertPhase, prayerId: string): string {
  return `${dateKey}|${phase}|${prayerId}`;
}
