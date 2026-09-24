import { useEffect, useState } from 'react';
import { ChevronRight, Compass, Map, Navigation } from 'lucide-react';
import type { Place } from './prayers';
import QiblaCompass from './QiblaCompass';
import QiblaArrows from './QiblaArrows';
import QiblaMap from './QiblaMap';

export type QiblaMode = 'compass' | 'arrows' | 'map';

export default function QiblaScreen({ place, bearing, onClose }: {
  place: Place;
  bearing: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<QiblaMode>('compass');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <section className="qibla-screen" role="dialog" aria-modal="true" aria-labelledby="qibla-screen-title">
      <header className="qibla-screen-header">
        <button className="qibla-back" onClick={onClose} aria-label="العودة إلى مواقيت الصلاة">
          <ChevronRight size={27} />
        </button>
        <div>
          <h2 id="qibla-screen-title">القبلة</h2>
          <small>{place.name} · <b dir="ltr">{bearing}°</b></small>
        </div>
        <span className="qibla-header-spacer" aria-hidden="true" />
      </header>

      <nav className="qibla-tabs" role="tablist" aria-label="أوضاع تحديد القبلة">
        <button
          role="tab"
          aria-selected={mode === 'map'}
          className={mode === 'map' ? 'active' : ''}
          onClick={() => setMode('map')}
        >
          <Map size={19} /> خريطة
        </button>
        <button
          role="tab"
          aria-selected={mode === 'arrows'}
          className={mode === 'arrows' ? 'active' : ''}
          onClick={() => setMode('arrows')}
        >
          <Navigation size={19} /> أسهم
        </button>
        <button
          role="tab"
          aria-selected={mode === 'compass'}
          className={mode === 'compass' ? 'active' : ''}
          onClick={() => setMode('compass')}
        >
          <Compass size={19} /> بوصلة
        </button>
      </nav>

      <div className={`qibla-mode-view qibla-mode-${mode}`}>
        {mode === 'compass' && (
          <div className="qibla-screen-compass">
            <p className="qibla-mode-intro">وجّه أعلى الهاتف أمامك، ثم حرّكه ببطء حتى يصبح السهم في منتصف الأعلى.</p>
            <QiblaCompass bearing={bearing} placeName={place.name} />
          </div>
        )}
        {mode === 'arrows' && <QiblaArrows bearing={bearing} placeName={place.name} />}
        {mode === 'map' && <QiblaMap place={place} bearing={bearing} />}
      </div>
    </section>
  );
}
