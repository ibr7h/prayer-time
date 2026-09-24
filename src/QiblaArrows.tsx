import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  animateHeadingStep,
  headingFromOrientation,
  signedBearingDelta,
  smoothSensorHeading
} from './QiblaCompass';

type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error';

type OrientationPermissionConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

type CompassOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

function accuracyLabel(value: number | null): string {
  if (value === null) return 'الدقة يحددها الجهاز';
  if (value <= 10) return `دقة قوية · ±${Math.round(value)}°`;
  if (value <= 20) return `دقة متوسطة · ±${Math.round(value)}°`;
  return `دقة منخفضة · ±${Math.round(value)}°`;
}

export default function QiblaArrows({ bearing, placeName }: {
  bearing: number;
  placeName: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const targetHeadingRef = useRef<number | null>(null);
  const animatedHeadingRef = useRef<number | null>(null);
  const accuracyRef = useRef<number | null>(null);
  const absoluteSeenRef = useRef(false);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [tilted, setTilted] = useState(false);
  const [aligned, setAligned] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
  }, []);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const handleOrientation = useCallback((event: Event) => {
    const orientation = event as CompassOrientationEvent;
    if (event.type === 'deviceorientationabsolute') absoluteSeenRef.current = true;
    if (
      event.type === 'deviceorientation' &&
      absoluteSeenRef.current &&
      !Number.isFinite(orientation.webkitCompassHeading)
    ) return;

    const result = headingFromOrientation(orientation);
    if (!result) return;

    accuracyRef.current = result.accuracy;
    targetHeadingRef.current = smoothSensorHeading(
      targetHeadingRef.current,
      result.heading,
      result.accuracy
    );
    setAccuracy(result.accuracy);
    setTilted(
      (Number.isFinite(orientation.beta) && Math.abs(orientation.beta as number) > 30) ||
      (Number.isFinite(orientation.gamma) && Math.abs(orientation.gamma as number) > 30)
    );
  }, []);

  useEffect(() => {
    if (cameraState !== 'active') return;
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [cameraState, handleOrientation]);

  useEffect(() => {
    if (cameraState !== 'active') return;
    let frame = 0;
    const animate = () => {
      const target = targetHeadingRef.current;
      if (target !== null) {
        const current = animatedHeadingRef.current ?? target;
        const next = animateHeadingStep(current, target, accuracyRef.current);
        animatedHeadingRef.current = next;
        setHeading(next);
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [cameraState]);

  const delta = heading === null ? null : signedBearingDelta(bearing, heading);

  useEffect(() => {
    if (delta === null || tilted) {
      setAligned(false);
      return;
    }
    const magnitude = Math.abs(delta);
    setAligned((previous) => previous ? magnitude <= 5 : magnitude <= 2.5);
  }, [delta, tilted]);

  const start = async () => {
    if (
      !window.isSecureContext ||
      typeof DeviceOrientationEvent === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraState('unsupported');
      return;
    }

    setCameraState('requesting');
    try {
      const OrientationEvent = DeviceOrientationEvent as OrientationPermissionConstructor;
      if (typeof OrientationEvent.requestPermission === 'function') {
        const permission = await OrientationEvent.requestPermission();
        if (permission !== 'granted') {
          setCameraState('denied');
          return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 1920 }
        }
      });
      streamRef.current = stream;
      absoluteSeenRef.current = false;
      targetHeadingRef.current = null;
      animatedHeadingRef.current = null;
      accuracyRef.current = null;
      setHeading(null);
      setAccuracy(null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('active');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setCameraState(name === 'NotAllowedError' ? 'denied' : 'error');
    }
  };

  const routeAngle = delta === null ? 0 : Math.max(-72, Math.min(72, delta));
  const instruction = delta === null
    ? 'شغّل الكاميرا ثم وجّه أعلى الهاتف أمامك.'
    : aligned
      ? 'أنت مواجه للقبلة'
      : `اتبع الأسهم وحرّك الهاتف ${Math.round(Math.abs(delta)).toLocaleString('ar-SA')}° إلى ${delta > 0 ? 'اليمين' : 'اليسار'}`;

  return (
    <div className="qibla-arrows">
      <div className={`qibla-camera-stage${aligned ? ' is-aligned' : ''}`}>
        <video ref={videoRef} className="qibla-camera-video" playsInline muted autoPlay aria-label="عرض الكاميرا لتوجيه القبلة" />
        <div className="qibla-camera-shade" aria-hidden="true" />

        <div className="camera-top-chip">
          <span>{placeName}</span>
          <b dir="ltr">{bearing}°</b>
        </div>

        <div className="camera-route-anchor" aria-hidden="true">
          <div className="camera-route" style={{ transform: `translateX(-50%) rotate(${routeAngle}deg)` }}>
            <span className="camera-kaaba-pin"><i /></span>
            {Array.from({ length: 7 }).map((_, index) => (
              <span key={index} className="camera-chevron" style={{ opacity: 1 - index * 0.1 }} />
            ))}
          </div>
        </div>

        <div className={`camera-guidance${aligned ? ' aligned' : ''}`}>
          <strong>{instruction}</strong>
          {heading !== null && <small>اتجاه الهاتف <b dir="ltr">{Math.round(heading)}°</b> · {accuracyLabel(accuracy)}</small>}
        </div>

        {cameraState !== 'active' && (
          <div className="camera-permission-card">
            <Camera size={34} />
            <strong>استخدم الكاميرا كدليل بصري</strong>
            <p>تظهر الأسهم فوق صورة الكاميرا وتتحرك مع اتجاه الهاتف. الفيديو لا يغادر جهازك.</p>
            <button className="primary-button wide" onClick={() => void start()} disabled={cameraState === 'requesting'}>
              <Camera size={18} /> {cameraState === 'requesting' ? 'جارٍ التشغيل…' : 'تشغيل وضع الأسهم'}
            </button>
            {cameraState === 'denied' && <small className="camera-error">لم يُسمح بالكاميرا أو مستشعر الاتجاه. غيّر الإذن من إعدادات Safari ثم أعد المحاولة.</small>}
            {cameraState === 'unsupported' && <small className="camera-error">هذا الوضع يحتاج HTTPS وكاميرا ومستشعر اتجاه متوافقًا.</small>}
            {cameraState === 'error' && <small className="camera-error">تعذّر تشغيل الكاميرا. أغلق التطبيقات التي تستخدمها ثم حاول مرة أخرى.</small>}
          </div>
        )}

        {cameraState === 'active' && (
          <button className="camera-stop" onClick={stopCamera} aria-label="إيقاف الكاميرا">
            <CameraOff size={17} /> إيقاف
          </button>
        )}
      </div>

      {tilted && <div className="compass-warning"><RotateCcw size={17} /> ضع الهاتف بشكل أقرب إلى الوضع الأفقي لتحسين ثبات الاتجاه.</div>}
      <div className="compass-note"><ShieldCheck size={16} /><span>الصورة والاتجاه يعالجان محليًا داخل الجهاز ولا يتم رفع الفيديو إلى خادم ميقاتي.</span></div>
    </div>
  );
}
