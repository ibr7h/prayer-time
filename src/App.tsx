import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, BellRing, Check, ChevronLeft, Clock3, Compass, Headphones, Info,
  LocateFixed, MapPin, Minus, Moon, Pause, Play, Plus, RefreshCw, Settings2,
  ShieldCheck, Smartphone, Sun, Sunrise, Sunset, Volume2, VolumeX, WifiOff, X
} from 'lucide-react';
import {
  cityPresets, civilDayAt, nextPrayer, prayerNames, qiblaBearing, secondsUntil,
  timeLabel, todayAndTomorrow, type AlertPrayerId, type Place,
  type PrayerEvent, type PrayerId, type Preferences
} from './prayers';
import { loadState, saveState } from './storage';
import QiblaScreen from './QiblaScreen';
import { APP_VERSION, startAppUpdater, type AppUpdater, type UpdateView } from './updater';
import {
  getNativeNotificationPermission, isNativeNotificationPlatform,
  requestNativeNotificationPermission, schedulePrayerNotifications,
  testNativePrayerNotification as sendNativeTestNotification,
  type NativeNotificationPermission
} from './nativeNotifications';

type Panel = 'location' | 'settings' | 'info' | null;
const alertIds: AlertPrayerId[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const icons = { fajr: Moon, sunrise: Sunrise, dhuhr: Sun, asr: Sun, maghrib: Sunset, isha: Moon };
const PRAYER_ALERT_STORAGE = 'miqati:prayer-alerts:v1';

function prayerAlertMarks(dateKey: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(PRAYER_ALERT_STORAGE) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((item) => String(item).startsWith(`${dateKey}|`)) : []);
  } catch {
    return new Set();
  }
}

function savePrayerAlertMarks(marks: Set<string>) {
  try { localStorage.setItem(PRAYER_ALERT_STORAGE, JSON.stringify([...marks])); } catch { /* ignore */ }
}

async function showPrayerNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL) ?? await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icon-192.png`,
      tag,
      data: { url: import.meta.env.BASE_URL }
    });
    return true;
  } catch {
    return false;
  }
}

function formatCountdown(seconds: number): string {
  const parts = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  return parts.map((part) => String(part).padStart(2, '0')).join(':');
}

function dateLabels(date: Date, timeZone: string) {
  try {
    return {
      hijri: new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone
      }).format(date),
      gregorian: new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone
      }).format(date)
    };
  } catch {
    return { hijri: '', gregorian: new Intl.DateTimeFormat('ar-SA', { dateStyle: 'full' }).format(date) };
  }
}

function placeFromPosition(position: GeolocationPosition): Place {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    name: 'موقعي الحالي', latitude, longitude, accuracy,
    // Device time zone normally follows the phone. A bounding box around Saudi
    // Arabia would wrongly include neighboring countries with different offsets.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    source: 'gps', updatedAt: Date.now()
  };
}

function standalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function App() {
  const nativeNotifications = isNativeNotificationPlatform();
  const [stored, setStored] = useState(loadState);
  const { place, preferences } = stored;
  const [now, setNow] = useState(() => new Date());
  const [panel, setPanel] = useState<Panel>(null);
  const [qiblaOpen, setQiblaOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [playing, setPlaying] = useState<PrayerId | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [permission, setPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const [nativePermission, setNativePermission] = useState<NativeNotificationPermission>(
    nativeNotifications ? 'prompt' : 'unsupported'
  );
  const [coordinates, setCoordinates] = useState({ lat: '', lon: '' });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const updaterRef = useRef<AppUpdater | null>(null);
  const [updateView, setUpdateView] = useState<UpdateView | null>(null);

  useEffect(() => saveState(stored), [stored]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    const visible = () => setNow(new Date());
    const network = () => setOnline(navigator.onLine);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', network);
      window.removeEventListener('offline', network);
    };
  }, []);

  useEffect(() => {
    const updater = startAppUpdater(setUpdateView, setMessage);
    updaterRef.current = updater;
    return () => {
      updaterRef.current = null;
      updater.dispose();
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (panel === 'location') {
      setCoordinates({
        lat: place?.latitude.toFixed(5) ?? '',
        lon: place?.longitude.toFixed(5) ?? ''
      });
    }
  }, [panel, place]);

  useEffect(() => {
    if (!panel) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panel]);

  const placeTimeZone = place?.timeZone ?? 'Asia/Riyadh';
  const civil = civilDayAt(now, placeTimeZone);
  const dayKey = `${civil.year}-${civil.month}-${civil.day}`;
  const schedules = useMemo(() => place ? todayAndTomorrow(place, preferences, now) : null,
    // Recalculate only on a new location, setting, or local calendar day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place, preferences, dayKey]);
  const upcoming = schedules ? nextPrayer(schedules.today, schedules.tomorrow, now) : null;
  const dates = dateLabels(now, placeTimeZone);

  useEffect(() => {
    if (!nativeNotifications) return;
    void getNativeNotificationPermission().then(setNativePermission);
  }, [nativeNotifications]);

  useEffect(() => {
    if (!nativeNotifications || nativePermission !== 'granted' || !place) return;
    let active = true;
    void schedulePrayerNotifications(place, preferences).then((result) => {
      if (!active || !result.warning) return;
      setMessage('تمت جدولة التنبيهات، لكن Android قد يؤخر بعضها لأن التنبيهات الدقيقة غير مفعّلة في إعدادات النظام.');
    }).catch(() => {
      if (active) setMessage('تعذّرت إعادة جدولة تنبيهات الصلاة الأصلية. افتح الإعدادات وحاول التفعيل مرة أخرى.');
    });
    return () => { active = false; };
  }, [nativeNotifications, nativePermission, place, preferences, dayKey]);

  const updatePreferences = (patch: Partial<Preferences>) => {
    setStored((current) => ({ ...current, preferences: { ...current.preferences, ...patch } }));
  };

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(null);
  }, []);

  const playAudio = useCallback(async (id: PrayerId) => {
    if (id === 'sunrise') return;
    stopAudio();
    const src = `${import.meta.env.BASE_URL}audio/${id === 'fajr' ? 'adhan-fajr' : 'adhan-default'}.mp3`;
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = () => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(null); } };
    audio.onerror = () => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(null); setMessage('تعذّر تحميل الصوت. أعد فتح التطبيق عند توفر اتصال بالإنترنت.'); } };
    try { await audio.play(); setPlaying(id); }
    catch { if (audioRef.current === audio) audioRef.current = null; setPlaying(null); setMessage('لم يسمح الجهاز بتشغيل الصوت تلقائيًا. اضغط تشغيل الأذان يدويًا.'); }
  }, [stopAudio]);

  // Same foreground notification pattern used in Student Records:
  // one alert shortly before the event and one at the event time, with daily duplicate protection.
  useEffect(() => {
    if (!schedules || !place || document.visibilityState !== 'visible') return;
    const currentTime = now.getTime();
    const dateKey = schedules.today.dateKey;
    const marks = prayerAlertMarks(dateKey);
    let changed = false;

    for (const event of schedules.today.events) {
      if (event.id === 'sunrise') continue;
      const id = event.id as AlertPrayerId;
      if (!preferences.alerts[id] || !Number.isFinite(event.at.getTime())) continue;

      const prayerTime = event.at.getTime();
      const beforeTime = prayerTime - 5 * 60_000;
      const beforeKey = `${dateKey}|before5|${id}`;
      const dueKey = `${dateKey}|due|${id}`;

      if (currentTime >= beforeTime && currentTime < beforeTime + 60_000 && !marks.has(beforeKey)) {
        marks.add(beforeKey);
        changed = true;
        setMessage(`باقي ٥ دقائق على صلاة ${prayerNames[id]}`);
        if (!nativeNotifications && permission === 'granted') {
          void showPrayerNotification(
            `باقي ٥ دقائق على صلاة ${prayerNames[id]}`,
            `${place.name} · وقت الصلاة ${timeLabel(event.at, place.timeZone)}`,
            beforeKey
          );
        }
      }

      if (currentTime >= prayerTime && currentTime < prayerTime + 60_000 && !marks.has(dueKey)) {
        marks.add(dueKey);
        changed = true;
        setMessage(`حان الآن وقت صلاة ${prayerNames[id]}`);
        if (preferences.soundOn) void playAudio(id);
        if (!nativeNotifications && permission === 'granted') {
          void showPrayerNotification(
            `حان وقت صلاة ${prayerNames[id]}`,
            `بحسب ${place.name} · ${timeLabel(event.at, place.timeZone)}`,
            dueKey
          );
        }
      }
    }

    if (changed) savePrayerAlertMarks(marks);
  }, [now, schedules, place, preferences.alerts, preferences.soundOn, permission, playAudio, nativeNotifications]);

  const useMyLocation = useCallback((quiet = false) => {
    if (!navigator.geolocation) { if (!quiet) setMessage('تحديد الموقع غير مدعوم في هذا المتصفح. اختر مدينة أو أدخل الإحداثيات.'); return; }
    if (!quiet) setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStored((current) => quiet && current.place?.source !== 'gps'
          ? current : { ...current, place: placeFromPosition(position) });
        setLocating(false);
        if (!quiet) setPanel(null);
        if (!quiet) setMessage('تم تحديث المواقيت حسب موقعك الفعلي.');
      },
      (error) => {
        setLocating(false);
        if (!quiet) setMessage(error.code === 1
          ? 'لم يُسمح بالوصول إلى الموقع. يمكنك السماح به من إعدادات الجهاز أو اختيار مدينة.'
          : 'تعذّر تحديد الموقع. جرّب مرة أخرى أو اختر مدينة قريبة.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 }
    );
  }, []);

  // Recheck an already granted GPS location when the app opens; never ask silently for new permission.
  useEffect(() => {
    if (place?.source !== 'gps' || !navigator.permissions?.query) return;
    navigator.permissions.query({ name: 'geolocation' }).then((status) => {
      if (status.state === 'granted') useMyLocation(true);
    }).catch(() => {});
    // Only check on first mount; manual city selection must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCity = (city: Place) => {
    setStored((current) => ({ ...current, place: { ...city, updatedAt: Date.now() } }));
    setPanel(null);
    setMessage('هذه مواقيت تقريبية لمركز المدينة. للحصول على دقة أعلى استخدم موقعك الفعلي.');
  };

  const setManualCoordinates = () => {
    const latitude = Number(coordinates.lat);
    const longitude = Number(coordinates.lon);
    if (!coordinates.lat.trim() || !coordinates.lon.trim() || !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setMessage('أدخل خط عرض بين ‎-٩٠ و٩٠ وخط طول بين ‎-١٨٠ و١٨٠.');
      return;
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    setStored((current) => ({ ...current, place: {
      latitude, longitude, timeZone, name: 'إحداثيات محددة', source: 'coordinates', updatedAt: Date.now()
    } }));
    setPanel(null);
    setMessage('تم استخدام الإحداثيات بتوقيت جهازك. تأكد أن توقيته يطابق الموقع المختار.');
  };

  const requestNotifications = async () => {
    if (nativeNotifications) {
      const result = await requestNativeNotificationPermission();
      setNativePermission(result);
      if (result === 'granted') {
        try {
          const summary = place ? await schedulePrayerNotifications(place, preferences) : null;
          setMessage(place
            ? `فُعّلت التنبيهات الأصلية وجدولت ${summary?.scheduled ?? 0} تنبيهًا للأيام الخمسة القادمة.`
            : 'فُعّلت التنبيهات الأصلية. حدّد موقعك لجدولة أوقات الصلاة.');
        } catch {
          setMessage('تم السماح بالتنبيهات، لكن تعذّرت الجدولة. أعد المحاولة بعد تحديد الموقع.');
        }
      } else {
        setMessage('لم يُسمح بالتنبيهات الأصلية. يمكنك تغيير الإذن من إعدادات الجهاز.');
      }
      return;
    }

    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      setMessage('إشعارات هذا المتصفح غير متاحة. يمكن إبقاء التطبيق مفتوحًا واستخدام الصوت.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setMessage(result === 'granted'
        ? 'فُعّلت تنبيهات الصلاة: قبل الوقت بـ٥ دقائق وعند دخول الوقت أثناء تشغيل التطبيق.'
        : 'لم يُسمح بالإشعارات؛ يمكن تغييرها من إعدادات المتصفح أو الجهاز.');
    } catch {
      setMessage('للسماح بإشعارات iPhone، أضف التطبيق أولًا إلى الشاشة الرئيسية وافتحه منها.');
    }
  };

  const testNotification = async () => {
    if (nativeNotifications) {
      try {
        let currentPermission = nativePermission;
        if (currentPermission !== 'granted') {
          currentPermission = await requestNativeNotificationPermission();
          setNativePermission(currentPermission);
        }
        if (currentPermission !== 'granted') {
          setMessage('لم يُسمح بالتنبيهات. فعّل الإذن من إعدادات الجهاز ثم أعد الاختبار.');
          return;
        }
        const ok = await sendNativeTestNotification();
        setMessage(ok
          ? 'تم جدولة تنبيه تجريبي؛ سيصل خلال ٥ ثوانٍ. يمكنك قفل الشاشة لاختباره.'
          : 'تعذّر اختبار التنبيه؛ تحقق من إذن الإشعارات.');
      } catch {
        setMessage('تعذّر إنشاء تنبيه الاختبار على هذا الجهاز.');
      }
      return;
    }

    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
      setMessage('إشعارات هذا المتصفح غير متاحة. على iPhone ثبّت ميقاتي على الشاشة الرئيسية أولًا.');
      return;
    }

    try {
      let currentPermission = Notification.permission;
      if (currentPermission !== 'granted') {
        if (currentPermission === 'denied') {
          setPermission('denied');
          setMessage('إذن الإشعارات مرفوض. غيّره من إعدادات المتصفح أو الجهاز ثم أعد الاختبار.');
          return;
        }
        currentPermission = await Notification.requestPermission();
        setPermission(currentPermission);
      }

      if (currentPermission !== 'granted') {
        setMessage('لم يتم السماح بالإشعارات، لذلك لا يمكن إرسال تنبيه الاختبار.');
        return;
      }

      const ok = await showPrayerNotification(
        'تنبيه تجريبي من ميقاتي',
        'إذا ظهر هذا الإشعار فتنبيهات ميقاتي تعمل على هذا الجهاز.',
        `miqati-test-${Date.now()}`
      );
      setMessage(ok
        ? 'تم إرسال تنبيه تجريبي الآن. إذا ظهر الإشعار فالتنبيهات تعمل بصورة صحيحة.'
        : 'تعذّر إرسال تنبيه الاختبار. تأكد أن ميقاتي مثبت وأن إذن الإشعارات مفعّل.');
    } catch {
      setMessage('تعذّر اختبار الإشعارات. على iPhone افتح ميقاتي من الشاشة الرئيسية ثم حاول مرة أخرى.');
    }
  };

  const notificationGranted = nativeNotifications
    ? nativePermission === 'granted'
    : permission === 'granted';

  const toggleAlert = (id: AlertPrayerId) => {
    updatePreferences({ alerts: { ...preferences.alerts, [id]: !preferences.alerts[id] } });
  };

  const nextIsTomorrow = schedules && upcoming &&
    upcoming.at.getTime() >= schedules.tomorrow.events[0].at.getTime();
  const bearing = place ? qiblaBearing(place) : null;

  return (
    <div className="app-shell">
      {updateView?.visible && <div className="update-overlay" role="status" aria-live="polite">
        <div className="update-card">
          <span className="update-icon"><RefreshCw size={26} /></span>
          <div className="update-copy">
            <span className="update-eyebrow">{updateView.version ? `الإصدار v${updateView.version}` : 'تحديث التطبيق'}</span>
            <h2>{updateView.title}</h2>
            <p>{updateView.status}</p>
          </div>
          <div className="update-progress-track" aria-label="تقدم تحديث التطبيق">
            <span className="update-progress-fill" style={{ width: `${Math.max(0, Math.min(100, updateView.progress))}%` }} />
          </div>
          <div className="update-progress-meta"><span>{updateView.detail}</span><strong>{Math.round(updateView.progress).toLocaleString('ar-SA')}٪</strong></div>
          {updateView.error && <button className="secondary-button wide" onClick={() => setUpdateView(null)}>متابعة بالإصدار الحالي</button>}
        </div>
      </div>}
      <main className="app-content">
        <header className="topbar">
          <div className="brand">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="brand-mark" />
            <div><span className="brand-title">ميقاتي</span><span className="brand-subtitle">وقتك للصلاة، أينما كنت</span></div>
          </div>
          <button className="icon-button header-settings" onClick={() => setPanel('settings')} aria-label="إعدادات التطبيق"><Settings2 size={20} strokeWidth={1.8} /></button>
        </header>

        <div className="date-line"><span>{dates.gregorian}</span><span className="date-divider">•</span><span>{dates.hijri}</span></div>

        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><span className="hero-star hero-star-one">✦</span><span className="hero-star hero-star-two">✦</span><span className="hero-moon" /></div>
          <div className="hero-content">
            <span className="hero-eyebrow"><span className="pulse-dot" /> {place ? 'مواقيت اليوم حسب موقعك' : 'ابدأ بتحديد موقعك'}</span>
            <h1 id="hero-title">{upcoming ? `القادمة: صلاة ${prayerNames[upcoming.id]}` : 'صلاتك في وقتها'}</h1>
            <p className="hero-copy">{upcoming ? `${nextIsTomorrow ? 'غدًا · ' : ''}${timeLabel(upcoming.at, placeTimeZone)}` : 'مواقيت دقيقة تبدأ من مكانك الفعلي.'}</p>
            <div className="countdown" dir="ltr" aria-label={upcoming ? 'الوقت المتبقي للصلاة القادمة' : undefined}>
              {upcoming ? formatCountdown(secondsUntil(upcoming.at, now)) : '--:--:--'}
            </div>
            <span className="countdown-label">{upcoming ? 'ساعة : دقيقة : ثانية' : 'الوقت المتبقي يظهر بعد تحديد الموقع'}</span>
          </div>
          <div className="hero-bottom"><Clock3 size={16} /><span>الطريقة: {preferences.method === 'ummAlQura' ? 'أم القرى' : preferences.method === 'egyptian' ? 'الهيئة المصرية' : 'رابطة العالم الإسلامي'}</span></div>
        </section>

        <button className="location-card" onClick={() => setPanel('location')}>
          <span className="location-icon"><MapPin size={20} strokeWidth={1.8} /></span>
          <span className="location-copy"><strong>{place?.name ?? 'حدّد موقعك للبدء'}</strong><small>{place
            ? place.source === 'gps' ? `موقع فعلي ${place.accuracy ? `· دقة نحو ${Math.round(place.accuracy)} م` : ''}` : 'موقع مختار يدويًا'
            : 'اسمح بالموقع أو اختر مدينة'}</small></span>
          <span className="location-change">{place ? 'تغيير' : 'ابدأ'}</span><ChevronLeft size={18} strokeWidth={1.8} />
        </button>

        <div className="section-heading"><div><span className="eyebrow">جدول اليوم</span><h2>مواقيت الصلاة</h2></div><span className="section-caption">{place ? '٦ أوقات' : 'حدّد الموقع أولًا'}</span></div>

        {schedules ? (
          <div className="prayer-list">
            {schedules.today.events.map((event) => (
              <PrayerRow key={event.id} event={event} place={place!} active={upcoming?.id === event.id && !nextIsTomorrow} playing={playing === event.id} onPlay={() => playing === event.id ? stopAudio() : void playAudio(event.id)} />
            ))}
          </div>
        ) : (
          <div className="empty-state"><LocateFixed size={34} /><strong>المواقيت بانتظار موقعك</strong><p>نحسبها على جهازك دون إرسال إحداثياتك إلى خادم التطبيق.</p><button className="primary-button" onClick={() => setPanel('location')}>تحديد الموقع</button></div>
        )}

        {place && <button className="qibla-card" onClick={() => setQiblaOpen(true)} aria-label="فتح شاشة القبلة"><span className="qibla-symbol"><Compass size={20} strokeWidth={1.8} /></span><div><strong>اتجاه القبلة</strong><small>بوصلة · أسهم · خريطة</small></div><span className="qibla-angle" dir="ltr">{bearing}°</span><ChevronLeft size={18} strokeWidth={1.8} /></button>}

        <section className="reality-card"><span className="reality-icon"><Info size={20} strokeWidth={1.8} /></span><div><strong>{nativeNotifications ? 'تنبيهات أصلية على الجهاز' : 'تنبيه مهم بخصوص iPhone'}</strong><p>{nativeNotifications ? 'تُجدول تنبيهات الصلاة محليًا على الجهاز للأيام الخمسة القادمة، لذلك يمكن أن تصل عند قفل الشاشة أو إغلاق التطبيق. الأذان الكامل يبقى ميزة منفصلة عن صوت الإشعار.' : 'الصوت والتنبيه المباشر يعملان أثناء فتح التطبيق. عند إغلاقه أو قفل الشاشة لا نضمن وصول تنبيه أو تشغيل الأذان؛ إشعارات الخلفية تحتاج Web Push أو النسخة الأصلية من التطبيق.'}</p><button className="text-action" onClick={() => setPanel('info')}>كيف يعمل التطبيق؟ <ChevronLeft size={15} strokeWidth={1.8} /></button></div></section>

        <footer className="footer"><span><ShieldCheck size={16} /> الحساب على جهازك · إحداثياتك لا تُرسل لخادم التطبيق</span><span>{online ? 'جاهز للعمل دون اتصال بعد أول تحميل' : <><WifiOff size={14} /> أنت غير متصل، المواقيت متاحة</>}</span><span>الإصدار v{APP_VERSION}</span></footer>
      </main>

      {qiblaOpen && place && bearing !== null && <QiblaScreen place={place} bearing={bearing} onClose={() => setQiblaOpen(false)} />}

      {message && <div className="toast" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="إغلاق الرسالة"><X size={17} /></button></div>}

      {panel && <div className="modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
        <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <div className="sheet-handle" /><div className="sheet-top"><h2 id="sheet-title">{panel === 'location' ? 'اختيار الموقع' : panel === 'settings' ? 'الإعدادات' : 'عن التنبيهات'}</h2><button className="icon-button" onClick={() => setPanel(null)} aria-label="إغلاق"><X size={20} strokeWidth={1.8} /></button></div>

          {panel === 'location' && <div className="sheet-body">
            <p className="sheet-intro">نستخدم الموقع لحساب أوقات الصلاة على جهازك فقط. يمكنك تغييره في أي وقت.</p>
            <button className="primary-button wide" onClick={() => useMyLocation()} disabled={locating}><LocateFixed size={20} strokeWidth={1.8} /> {locating ? 'جارٍ تحديد موقعك…' : 'استخدم موقعي الفعلي'}</button>
            <div className="subtle-note"><ShieldCheck size={16} /> لا تُرسل الإحداثيات إلى خادم التطبيق؛ تُحفظ على هذا الجهاز.</div>
            <h3 className="sheet-section-title">أو اختر مدينة سعودية</h3>
            <div className="city-grid">{cityPresets.map((city) => <button key={city.name} onClick={() => setCity(city)} className={place?.source === 'city' && place.name === city.name ? 'selected' : ''}>{city.name}{place?.source === 'city' && place.name === city.name && <Check size={15} />}</button>)}</div>
            <p className="fine-print">مواقيت المدن تُحسب من مركز المدينة؛ قد تختلف عن موقعك داخلها.</p>
            <details className="manual-details"><summary>إدخال إحداثيات يدويًا <ChevronLeft size={17} /></summary><div className="manual-fields"><label>خط العرض<input inputMode="decimal" type="number" min="-90" max="90" step="any" placeholder="21.5433" value={coordinates.lat} onChange={(event) => setCoordinates((s) => ({ ...s, lat: event.target.value }))} /></label><label>خط الطول<input inputMode="decimal" type="number" min="-180" max="180" step="any" placeholder="39.1728" value={coordinates.lon} onChange={(event) => setCoordinates((s) => ({ ...s, lon: event.target.value }))} /></label></div><button className="secondary-button wide" onClick={setManualCoordinates}>اعتماد الإحداثيات</button><small>خارج السعودية سيُستخدم توقيت الجهاز: {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}.</small></details>
          </div>}

          {panel === 'settings' && <div className="sheet-body">
            <p className="sheet-intro">اضبط طريقة الحساب حسب مسجدك المحلي. قد توجد فروقات بضع دقائق عن التقويم الرسمي.</p>
            <label className="field-label" htmlFor="method">طريقة حساب المواقيت</label><select id="method" className="select-field" value={preferences.method} onChange={(event) => updatePreferences({ method: event.target.value as Preferences['method'] })}><option value="ummAlQura">أم القرى · السعودية</option><option value="muslimWorldLeague">رابطة العالم الإسلامي</option><option value="egyptian">الهيئة المصرية للمساحة</option></select>
            <label className="field-label" htmlFor="madhab">حساب صلاة العصر</label><select id="madhab" className="select-field" value={preferences.madhab} onChange={(event) => updatePreferences({ madhab: event.target.value as Preferences['madhab'] })}><option value="shafi">الجمهور</option><option value="hanafi">الحنفي</option></select>
            <div className="adjust-row"><div><strong>تصحيح الأوقات</strong><small>يُطبّق على الصلوات الخمس، لا الشروق</small></div><div className="stepper"><button aria-label="نقصان دقيقة" disabled={preferences.adjustment <= -30} onClick={() => updatePreferences({ adjustment: preferences.adjustment - 1 })}><Minus size={16} /></button><span dir="ltr">{preferences.adjustment > 0 ? '+' : ''}{preferences.adjustment} د</span><button aria-label="زيادة دقيقة" disabled={preferences.adjustment >= 30} onClick={() => updatePreferences({ adjustment: preferences.adjustment + 1 })}><Plus size={16} /></button></div></div>
            <div className="settings-divider" />
            <label className="switch-row"><span className="switch-icon"><Volume2 size={20} strokeWidth={1.8} /></span><span><strong>صوت الأذان</strong><small>عندما يحين الوقت والتطبيق مفتوح</small></span><input aria-label="صوت الأذان" type="checkbox" checked={preferences.soundOn} onChange={(event) => updatePreferences({ soundOn: event.target.checked })} /><span className="switch-track" /></label>
            <div className="notification-row"><span className="switch-icon"><Bell size={20} strokeWidth={1.8} /></span><div><strong>تنبيهات الصلاة</strong><small>{nativeNotifications ? (nativePermission === 'granted' ? 'Native · تعمل عند قفل الشاشة · جدولة ٥ أيام' : nativePermission === 'denied' ? 'الإذن مرفوض من إعدادات الجهاز' : 'تنبيهات محلية أصلية لـ iPhone وAndroid') : (permission === 'granted' ? 'قبل الصلاة بـ٥ دقائق وعند دخول الوقت أثناء تشغيل PWA' : 'لـ iPhone PWA: ثبّت التطبيق أولًا من Safari')}</small></div><button onClick={() => void requestNotifications()} disabled={notificationGranted}>{notificationGranted ? 'مفعّل' : 'تفعيل'}</button></div>
            <div className="notification-row"><span className="switch-icon"><BellRing size={20} strokeWidth={1.8} /></span><div><strong>اختبار التنبيه</strong><small>{nativeNotifications ? 'تنبيه تجريبي بعد ٥ ثوانٍ لاختبار القفل والخلفية' : permission === 'granted' ? 'إرسال إشعار تجريبي الآن' : 'سيطلب إذن الإشعارات ثم يرسل اختبارًا'}</small></div><button onClick={() => void testNotification()}>اختبار</button></div>
            <div className="notification-row"><span className="switch-icon"><RefreshCw size={20} strokeWidth={1.8} /></span><div><strong>تحديث التطبيق</strong><small>الإصدار v{APP_VERSION} · فحص تلقائي عند الفتح والعودة للتطبيق</small></div><button onClick={() => void updaterRef.current?.check(true)}>فحص</button></div>
            <h3 className="sheet-section-title">الصلاة المشمولة بالتنبيه</h3><div className="alert-grid">{alertIds.map((id) => <label key={id} className="alert-choice"><input type="checkbox" checked={preferences.alerts[id]} onChange={() => toggleAlert(id)} /><span>{prayerNames[id]}</span><Check size={15} /></label>)}</div>
            <p className="fine-print">عند شهر رمضان، تُضاف ٣٠ دقيقة لعشاء طريقة أم القرى تلقائيًا. راجع تقويم مسجدك.</p>
          </div>}

          {panel === 'info' && <div className="sheet-body info-body">
            <div className="info-item"><span><MapPin size={20} strokeWidth={1.8} /></span><div><strong>موقعك وخصوصيتك</strong><p>المواقيت تُحسب على الجهاز من إحداثياتك ولا نرسلها إلى خادم التطبيق. يُحدّث الموقع عند الفتح إن كنت قد أذنت به. للمواقع خارج السعودية، تأكد أن توقيت الجهاز يطابق المكان.</p></div></div>
            <div className="info-item"><span><Headphones size={20} strokeWidth={1.8} /></span><div><strong>الأذان الصوتي</strong><p>اضغط تشغيل بجانب الصلاة لتجربة الصوت. يمكن للتطبيق محاولة تشغيله عند دخول الوقت أثناء فتحه، لكن المتصفح قد يمنع التشغيل التلقائي.</p></div></div>
            <div className="info-item"><span><BellRing size={20} strokeWidth={1.8} /></span><div><strong>تنبيهات الصلاة</strong><p>{nativeNotifications ? 'في نسخة iPhone/Android تُجدول التنبيهات محليًا على الجهاز: قبل الصلاة بـ٥ دقائق وعند دخول الوقت، وتُعاد الجدولة تلقائيًا عند تغيير الموقع أو طريقة الحساب أو التصحيح أو الصلوات المفعّلة.' : 'في نسخة PWA يظهر تنبيه قبل الصلاة بـ٥ دقائق ثم تنبيه عند دخول الوقت أثناء تشغيل التطبيق. للعمل عند الإغلاق يلزم Web Push أو تثبيت النسخة الأصلية من ميقاتي.'}</p></div></div>
            <div className="info-item"><span><Smartphone size={20} strokeWidth={1.8} /></span><div><strong>إضافة التطبيق للآيفون</strong><p>بعد نشره عبر HTTPS، افتح الرابط في Safari ثم اختر «مشاركة ← إضافة إلى الشاشة الرئيسية». بعد أول تحميل تصبح الحسابات والصوت متاحة دون إنترنت.</p></div></div>
            <span className="install-status">{standalone() ? 'التطبيق مفتوح من الشاشة الرئيسية' : 'تعمل الآن في المتصفح؛ يمكنك إضافته للشاشة الرئيسية بعد نشره'}</span>
          </div>}
        </section>
      </div>}
    </div>
  );
}

function PrayerRow({ event, place, active, playing, onPlay }: {
  event: PrayerEvent; place: Place; active: boolean; playing: boolean; onPlay: () => void;
}) {
  const Icon = icons[event.id];
  return <div className={`prayer-row${active ? ' prayer-row-active' : ''}`}>
    <span className={`prayer-symbol prayer-symbol-${event.id}`}><Icon size={22} strokeWidth={1.8} /></span>
    <div className="prayer-info"><strong>{prayerNames[event.id]}</strong><small>{event.id === 'sunrise' ? 'معلومة · بلا تنبيه' : active ? 'الصلاة القادمة' : 'وقت الصلاة'}</small></div>
    <span className="prayer-time" dir="rtl">{timeLabel(event.at, place.timeZone)}</span>
    {event.id !== 'sunrise' ? <button className="play-button" onClick={onPlay} aria-label={playing ? `إيقاف أذان ${prayerNames[event.id]}` : `تشغيل أذان ${prayerNames[event.id]}`} title={playing ? 'إيقاف الأذان' : 'استمع إلى الأذان'}>{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button> : <span className="play-placeholder"><VolumeX size={15} /></span>}
  </div>;
}
