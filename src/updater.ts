export const APP_VERSION = '0.7.5';

export interface UpdateView {
  visible: boolean;
  title: string;
  status: string;
  progress: number;
  version?: string;
  detail?: string;
  error?: boolean;
}

export interface AppUpdater {
  check(manual?: boolean): Promise<void>;
  dispose(): void;
}

function compareVersions(a: string, b: string): number {
  const aa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const bb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchPublishedVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}version.js?check=${Date.now()}`,
      { cache: 'no-store', headers: { 'cache-control': 'no-cache' } }
    );
    if (!response.ok) return null;
    const text = await response.text();
    return text.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function startAppUpdater(
  report: (view: UpdateView | null) => void,
  notify: (message: string) => void
): AppUpdater {
  let registration: ServiceWorkerRegistration | null = null;
  let disposed = false;
  let reloading = false;
  let targetVersion = '';
  const hadControllerAtStart = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  let canReload = hadControllerAtStart;

  const updateView = (patch: Partial<UpdateView> & Pick<UpdateView, 'title' | 'status'>) => {
    if (disposed) return;
    report({
      visible: true,
      progress: 0,
      version: targetVersion || APP_VERSION,
      detail: '',
      ...patch
    });
  };

  const attachRegistration = (next: ServiceWorkerRegistration) => {
    registration = next;
    next.addEventListener('updatefound', () => {
      const worker = next.installing;
      if (!worker || !navigator.serviceWorker.controller) return;
      updateView({
        title: 'يوجد تحديث جديد',
        status: 'جارٍ تجهيز الإصدار الجديد…',
        progress: 18,
        detail: 'بدء تنزيل ملفات التطبيق'
      });
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          updateView({
            title: 'اكتمل التنزيل',
            status: 'جارٍ تثبيت التحديث…',
            progress: 86,
            detail: 'تم تنزيل ملفات الإصدار الجديد'
          });
          next.waiting?.postMessage({ type: 'SKIP_WAITING' });
        } else if (worker.state === 'activating') {
          updateView({
            title: 'جارٍ تفعيل الإصدار',
            status: 'يتم استبدال ملفات التطبيق القديمة…',
            progress: 96,
            detail: 'تهيئة النسخة الجديدة'
          });
        }
      });
    });
  };

  const check = async (manual = false) => {
    if (disposed) return;
    if (!navigator.onLine) {
      if (manual) notify('لا يوجد اتصال بالإنترنت. سأفحص التحديث عند عودة الاتصال.');
      return;
    }

    const latest = await fetchPublishedVersion();
    const newer = !!latest && compareVersions(latest, APP_VERSION) > 0;
    if (newer && latest) {
      targetVersion = latest;
      updateView({
        title: 'يوجد إصدار جديد',
        status: 'جارٍ بدء التحديث تلقائيًا…',
        progress: 8,
        version: latest,
        detail: `التحقق من الإصدار v${latest}`
      });
    } else if (manual) {
      notify(`التطبيق محدث — الإصدار v${APP_VERSION}`);
    }

    try {
      if (!registration) {
        registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL) ?? null;
        if (registration) attachRegistration(registration);
      }
      await registration?.update();
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      if (newer) {
        updateView({
          title: 'تعذر إكمال التحديث',
          status: 'بقي الإصدار الحالي دون تغيير.',
          progress: 12,
          version: latest ?? APP_VERSION,
          detail: 'سنحاول مرة أخرى عند توفر اتصال مستقر.',
          error: true
        });
      }
    }
  };

  const onControllerChange = () => {
    if (!canReload) {
      canReload = true;
      return;
    }
    if (reloading || disposed) return;
    reloading = true;
    updateView({
      title: 'تم التحديث بنجاح',
      status: 'إعادة فتح التطبيق على الإصدار الجديد…',
      progress: 100,
      detail: 'اكتمل تثبيت جميع الملفات'
    });
    window.setTimeout(() => window.location.reload(), 650);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  const onOnline = () => { void check(); };

  if (!('serviceWorker' in navigator)) {
    return { check, dispose: () => { disposed = true; } };
  }

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);

  navigator.serviceWorker.ready.then((ready) => {
    if (disposed) return;
    attachRegistration(ready);
    void check();
  }).catch(() => {});

  const timer = window.setInterval(() => { void check(); }, 30 * 60 * 1000);

  try {
    const key = 'miqati:app-version';
    const previous = localStorage.getItem(key);
    if (previous && previous !== APP_VERSION) {
      window.setTimeout(() => notify(`تم تحديث التطبيق إلى الإصدار v${APP_VERSION}`), 500);
    }
    localStorage.setItem(key, APP_VERSION);
  } catch {
    // Storage can be unavailable in private browsing.
  }

  return {
    check,
    dispose() {
      disposed = true;
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    }
  };
}
