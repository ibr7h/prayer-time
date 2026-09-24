import { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Navigation, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react';

type CompassState = 'idle' | 'listening' | 'denied' | 'unsupported' | 'error';

type CompassOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type OrientationPermissionConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function signedBearingDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

export function headingFromOrientation(event: CompassOrientationEvent): {
  heading: number;
  accuracy: number | null;
  absolute: boolean;
} | null {
  if (Number.isFinite(event.webkitCompassHeading)) {
    return {
      heading: normalizeDegrees(event.webkitCompassHeading as number),
      accuracy: Number.isFinite(event.webkitCompassAccuracy)
        ? Math.max(0, event.webkitCompassAccuracy as number)
        : null,
      absolute: true
    };
  }

  if (event.absolute && Number.isFinite(event.alpha)) {
    return {
      // Absolute alpha is 0° at north and increases counter-clockwise.
      // Compass headings increase clockwise, so invert alpha.
      heading: normalizeDegrees(360 - (event.alpha as number)),
      accuracy: null,
      absolute: true
    };
  }

  return null;
}

function screenIsPortrait(): boolean {
  const angle = screen.orientation?.angle ?? 0;
  return Math.abs(angle) % 180 === 0;
}

function qualityLabel(accuracy: number | null): string {
  if (accuracy === null) return 'دقة المستشعر يحددها الجهاز';
  if (accuracy <= 10) return `دقة جيدة · ±${Math.round(accuracy)}°`;
  if (accuracy <= 20) return `دقة متوسطة · ±${Math.round(accuracy)}°`;
  return `دقة ضعيفة · ±${Math.round(accuracy)}°`;
}

export default function QiblaCompass({ bearing, placeName }: {
  bearing: number;
  placeName: string;
}) {
  const [state, setState] = useState<CompassState>('idle');
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [tilted, setTilted] = useState(false);
  const [portrait, setPortrait] = useState(screenIsPortrait);
  const absoluteSeenRef = useRef(false);
  const alignedRef = useRef(false);

  const handleOrientation = useCallback((event: Event) => {
    const orientation = event as CompassOrientationEvent;
    if (event.type === 'deviceorientationabsolute') absoluteSeenRef.current = true;
    if (event.type === 'deviceorientation' && absoluteSeenRef.current &&
      !Number.isFinite(orientation.webkitCompassHeading)) return;

    const result = headingFromOrientation(orientation);
    if (!result) return;

    setHeading((previous) => {
      if (previous === null) return result.heading;
      const delta = signedBearingDelta(result.heading, previous);
      return normalizeDegrees(previous + delta * 0.22);
    });
    setAccuracy(result.accuracy);
    setTilted(
      (Number.isFinite(orientation.beta) && Math.abs(orientation.beta as number) > 25) ||
      (Number.isFinite(orientation.gamma) && Math.abs(orientation.gamma as number) > 25)
    );
    setState('listening');
  }, []);

  useEffect(() => {
    if (state !== 'listening') return;
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [state, handleOrientation]);

  useEffect(() => {
    const update = () => setPortrait(screenIsPortrait());
    screen.orientation?.addEventListener?.('change', update);
    window.addEventListener('orientationchange', update);
    return () => {
      screen.orientation?.removeEventListener?.('change', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const startCompass = async () => {
    if (!window.isSecureContext || typeof DeviceOrientationEvent === 'undefined') {
      setState('unsupported');
      return;
    }

    try {
      const OrientationEvent = DeviceOrientationEvent as OrientationPermissionConstructor;
      if (typeof OrientationEvent.requestPermission === 'function') {
        const permission = await OrientationEvent.requestPermission();
        if (permission !== 'granted') {
          setState('denied');
          return;
        }
      }
      absoluteSeenRef.current = false;
      setHeading(null);
      setAccuracy(null);
      setState('listening');
    } catch {
      setState('error');
    }
  };

  const delta = heading === null ? null : signedBearingDelta(bearing, heading);
  const aligned = delta !== null && Math.abs(delta) <= 3 && !tilted && portrait;

  useEffect(() => {
    if (aligned && !alignedRef.current) navigator.vibrate?.(35);
    alignedRef.current = aligned;
  }, [aligned]);

  const instruction = delta === null
    ? 'شغّل البوصلة ثم ضع الهاتف بشكل أفقي ووجّه أعلاه إلى الأمام.'
    : aligned
      ? 'أنت الآن باتجاه القبلة'
      : `أدر الهاتف ${Math.round(Math.abs(delta)).toLocaleString('ar-SA')}° إلى ${delta > 0 ? 'اليمين' : 'اليسار'}`;

  return (
    <div className="qibla-compass">
      <div className="qibla-compass-summary">
        <span><Compass size={19} /></span>
        <div>
          <strong>اتجاه القبلة من {placeName}</strong>
          <small>زاوية القبلة من الشمال الجغرافي</small>
        </div>
        <b dir="ltr">{bearing}°</b>
      </div>

      <div className={`compass-dial${aligned ? ' is-aligned' : ''}`} aria-label="بوصلة القبلة">
        <div
          className="compass-cardinals"
          style={{ transform: `rotate(${-(heading ?? 0)}deg)` }}
          aria-hidden="true"
        >
          <span className="cardinal cardinal-n">N</span>
          <span className="cardinal cardinal-e">E</span>
          <span className="cardinal cardinal-s">S</span>
          <span className="cardinal cardinal-w">W</span>
        </div>
        <div className="compass-center" aria-hidden="true" />
        <div
          className="qibla-needle"
          style={{ transform: `rotate(${delta ?? bearing}deg)` }}
          aria-hidden="true"
        >
          <span className="qibla-kaaba">◆</span>
          <span className="qibla-arrow"><Navigation size={31} fill="currentColor" /></span>
        </div>
        <span className="phone-forward" aria-hidden="true">▲</span>
      </div>

      <div className={`qibla-guidance${aligned ? ' is-aligned' : ''}`} role="status" aria-live="polite">
        <strong>{instruction}</strong>
        {heading !== null && <small>اتجاه الهاتف <b dir="ltr">{Math.round(heading)}°</b> · {qualityLabel(accuracy)}</small>}
      </div>

      {!portrait && <div className="compass-warning"><Smartphone size={17} /> استخدم الهاتف بالوضع العمودي للحصول على اتجاه أوضح.</div>}
      {tilted && <div className="compass-warning"><RotateCcw size={17} /> ضع الهاتف بشكل أفقي قدر الإمكان ثم أعد توجيهه.</div>}

      {state !== 'listening' && <button className="primary-button wide compass-start" onClick={() => void startCompass()}>
        <Compass size={19} /> {state === 'idle' ? 'تشغيل البوصلة' : 'إعادة محاولة تشغيل البوصلة'}
      </button>}

      {state === 'denied' && <p className="compass-error">لم يُسمح بالوصول إلى مستشعر الاتجاه. اسمح بالحركة والاتجاه من إعدادات Safari ثم أعد المحاولة.</p>}
      {state === 'unsupported' && <p className="compass-error">البوصلة الحية غير متاحة في هذا المتصفح أو الصفحة ليست عبر HTTPS. ما زالت زاوية القبلة أعلاه صحيحة للموقع المختار.</p>}
      {state === 'error' && <p className="compass-error">تعذّر تشغيل مستشعر الاتجاه. أغلق الصفحة وافتحها من Safari أو من تطبيق PWA ثم أعد المحاولة.</p>}

      <div className="compass-note"><ShieldCheck size={16} /><span>تُقرأ حركة الهاتف محليًا فقط ولا تُرسل بيانات المستشعر إلى خادم التطبيق. قد تتأثر البوصلة بالمغناطيس والمعادن القريبة.</span></div>
    </div>
  );
}
