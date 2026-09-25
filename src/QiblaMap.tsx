import { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, MapPin, RotateCcw, ShieldCheck, WifiOff } from 'lucide-react';
import type { Place } from './prayers';
import {
  animateHeadingStep,
  headingFromOrientation,
  signedBearingDelta,
  smoothSensorHeading
} from './QiblaCompass';

type HeadingState = 'idle' | 'listening' | 'denied' | 'unsupported' | 'error';

type OrientationPermissionConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

type CompassOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

function mapBounds(place: Place): string {
  const latSpan = 0.012;
  const cosLat = Math.max(0.35, Math.cos(place.latitude * Math.PI / 180));
  const lonSpan = latSpan / cosLat;
  const left = place.longitude - lonSpan;
  const right = place.longitude + lonSpan;
  const bottom = place.latitude - latSpan;
  const top = place.latitude + latSpan;
  return [left, bottom, right, top].map((value) => value.toFixed(6)).join('%2C');
}

function osmEmbedUrl(place: Place): string {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds(place)}&layer=mapnik&marker=${place.latitude.toFixed(6)}%2C${place.longitude.toFixed(6)}`;
}

function accuracyLabel(value: number | null): string {
  if (value === null) return 'دقة المستشعر غير معروفة';
  if (value <= 10) return `دقة المستشعر قوية · ±${Math.round(value)}°`;
  if (value <= 20) return `دقة المستشعر متوسطة · ±${Math.round(value)}°`;
  return `دقة المستشعر ضعيفة · ±${Math.round(value)}°`;
}

export default function QiblaMap({ place, bearing }: {
  place: Place;
  bearing: number;
}) {
  const online = navigator.onLine;
  const [headingState, setHeadingState] = useState<HeadingState>('idle');
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [tilted, setTilted] = useState(false);
  const [aligned, setAligned] = useState(false);

  const targetHeadingRef = useRef<number | null>(null);
  const animatedHeadingRef = useRef<number | null>(null);
  const accuracyRef = useRef<number | null>(null);
  const absoluteSeenRef = useRef(false);

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

    setAccuracy((previous) => {
      if (result.accuracy === null) return previous;
      if (previous === null || Math.abs(previous - result.accuracy) >= 1.5) return result.accuracy;
      return previous;
    });
    setTilted(
      (Number.isFinite(orientation.beta) && Math.abs(orientation.beta as number) > 30) ||
      (Number.isFinite(orientation.gamma) && Math.abs(orientation.gamma as number) > 30)
    );
    setHeadingState('listening');
  }, []);

  useEffect(() => {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [handleOrientation]);

  useEffect(() => {
    let frame = 0;
    const animate = () => {
      const target = targetHeadingRef.current;
      if (target !== null) {
        const current = animatedHeadingRef.current ?? target;
        const next = animateHeadingStep(current, target, accuracyRef.current);
        animatedHeadingRef.current = next;
        setHeading((previous) => {
          if (previous !== null && Math.abs(signedBearingDelta(next, previous)) < 0.04) return previous;
          return next;
        });
      }
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const startHeading = async () => {
    if (!window.isSecureContext || typeof DeviceOrientationEvent === 'undefined') {
      setHeadingState('unsupported');
      return;
    }

    try {
      const OrientationEvent = DeviceOrientationEvent as OrientationPermissionConstructor;
      if (typeof OrientationEvent.requestPermission === 'function') {
        const permission = await OrientationEvent.requestPermission();
        if (permission !== 'granted') {
          setHeadingState('denied');
          return;
        }
      }

      absoluteSeenRef.current = false;
      targetHeadingRef.current = null;
      animatedHeadingRef.current = null;
      accuracyRef.current = null;
      setHeading(null);
      setAccuracy(null);
      setHeadingState('listening');
    } catch {
      setHeadingState('error');
    }
  };

  const relativeBearing = heading === null
    ? bearing
    : signedBearingDelta(bearing, heading);
  const sensorReliable = accuracy === null || accuracy <= 25;

  useEffect(() => {
    if (heading === null || tilted || !sensorReliable) {
      setAligned(false);
      return;
    }

    const magnitude = Math.abs(signedBearingDelta(bearing, heading));
    setAligned((previous) => previous ? magnitude <= 5 : magnitude <= 2.5);
  }, [bearing, heading, tilted, sensorReliable]);

  const instruction = heading === null
    ? 'شغّل اتجاه الخريطة ليصبح أعلى الشاشة هو اتجاه الهاتف.'
    : aligned
      ? 'أنت الآن باتجاه القبلة'
      : `أدر الهاتف ${Math.round(Math.abs(relativeBearing)).toLocaleString('ar-SA')}° إلى ${relativeBearing > 0 ? 'اليمين' : 'اليسار'}`;

  const mapRotation = heading === null ? 0 : -heading;
  const courseClass = heading === null ? 'is-neutral' : aligned ? 'is-aligned' : 'is-off-course';

  return (
    <div className="qibla-map-mode">
      <div className={`qibla-map-stage ${courseClass}`}>
        {online ? (
          <iframe
            className="qibla-map-rotating-layer"
            title="خريطة موقعك واتجاه القبلة"
            src={osmEmbedUrl(place)}
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ transform: `translate(-50%, -50%) rotate(${mapRotation}deg)` }}
          />
        ) : (
          <div className="qibla-map-offline"><WifiOff size={30} /><strong>الخريطة تحتاج اتصالًا بالإنترنت</strong><span>يبقى اتجاه القبلة المحسوب متاحًا.</span></div>
        )}

        <div className="map-location-chip">
          <MapPin size={15} />
          <span>{place.name}</span>
        </div>

        <div className={`map-sensor-chip ${accuracy !== null && accuracy > 20 ? 'weak' : ''}`}>
          <span>{accuracyLabel(accuracy)}</span>
        </div>

        <div
          className={`map-heading-rose ${courseClass}`}
          style={{ transform: `translate(-50%, -50%) rotate(${mapRotation}deg)` }}
          aria-hidden="true"
        >
          <span className="map-cardinal map-n">شمال</span>
          <span className="map-cardinal map-e">شرق</span>
          <span className="map-cardinal map-s">جنوب</span>
          <span className="map-cardinal map-w">غرب</span>
        </div>

        <span className={`map-forward-pointer ${courseClass}`} aria-hidden="true" />

        <div className="map-user-dot" aria-label="موقعك" />
        <div
          className={`map-qibla-ray ${courseClass}`}
          style={{ transform: `translateX(-50%) rotate(${relativeBearing}deg)` }}
          aria-hidden="true"
        >
          <span className="map-kaaba"><i /></span>
          <span className="map-ray-line" />
        </div>

        <div className={`map-direction-card ${courseClass}`} role="status" aria-live="polite">
          <strong>{instruction}</strong>
          {heading !== null
            ? <span>اتجاه الهاتف <b dir="ltr">{Math.round(heading)}°</b> · القبلة <b dir="ltr">{bearing}°</b></span>
            : <span>الخريطة الآن شمالها إلى أعلى حتى تشغيل مستشعر الاتجاه.</span>}
          {headingState !== 'listening' && (
            <button className="map-heading-button" onClick={() => void startHeading()}>
              <Compass size={17} /> تشغيل اتجاه الخريطة
            </button>
          )}
          {headingState === 'denied' && <small>لم يُسمح بمستشعر الاتجاه. فعّل إذن الحركة والاتجاه من إعدادات Safari.</small>}
          {headingState === 'unsupported' && <small>هذا الجهاز أو المتصفح لا يتيح اتجاه الهاتف للصفحة.</small>}
          {headingState === 'error' && <small>تعذّر تشغيل مستشعر الاتجاه. أعد فتح التطبيق وحاول مرة أخرى.</small>}
        </div>

        {tilted && <div className="map-tilt-warning"><RotateCcw size={16} /> ضع الهاتف بشكل أقرب إلى الوضع الأفقي لتحسين دقة الاتجاه.</div>}
      </div>

      <div className="compass-note map-note"><ShieldCheck size={16} /><span>عند تشغيل اتجاه الخريطة يصبح أعلى الشاشة هو اتجاه مقدمة الهاتف، وتدور الخريطة والجهات حول موقعك. خريطة OpenStreetMap تُحمّل من الإنترنت.</span></div>
    </div>
  );
}
