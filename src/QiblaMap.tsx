import { MapPin, ShieldCheck, WifiOff } from 'lucide-react';
import type { Place } from './prayers';

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

export default function QiblaMap({ place, bearing }: {
  place: Place;
  bearing: number;
}) {
  const online = navigator.onLine;

  return (
    <div className="qibla-map-mode">
      <div className="qibla-map-summary">
        <span><MapPin size={19} /></span>
        <div>
          <strong>{place.name}</strong>
          <small dir="ltr">{place.latitude.toFixed(5)}°, {place.longitude.toFixed(5)}°</small>
        </div>
        <b dir="ltr">{bearing}°</b>
      </div>

      <div className="qibla-map-stage">
        {online ? (
          <iframe
            title="خريطة موقعك واتجاه القبلة"
            src={osmEmbedUrl(place)}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="qibla-map-offline"><WifiOff size={30} /><strong>الخريطة تحتاج اتصالًا بالإنترنت</strong><span>يبقى اتجاه القبلة المحسوب متاحًا.</span></div>
        )}

        <div className="map-cardinal map-n">شمال</div>
        <div className="map-cardinal map-e">شرق</div>
        <div className="map-cardinal map-s">جنوب</div>
        <div className="map-cardinal map-w">غرب</div>

        <div className="map-user-dot" aria-label="موقعك" />
        <div
          className="map-qibla-ray"
          style={{ transform: `translateX(-50%) rotate(${bearing}deg)` }}
          aria-hidden="true"
        >
          <span className="map-kaaba"><i /></span>
          <span className="map-ray-line" />
        </div>
      </div>

      <div className="map-direction-card">
        <strong>اتجاه القبلة <b dir="ltr">{bearing}°</b></strong>
        <span>الخريطة شمالها إلى أعلى؛ الخط الأخضر يوضح امتداد اتجاه القبلة من موقعك.</span>
      </div>

      <div className="compass-note"><ShieldCheck size={16} /><span>الموقع المستخدم هو الموقع المحفوظ في ميقاتي. خريطة OpenStreetMap تُحمّل من الإنترنت عند فتح هذا الوضع.</span></div>
    </div>
  );
}
