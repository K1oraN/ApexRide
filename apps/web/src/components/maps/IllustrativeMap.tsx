import { useState } from 'react';
import { Flag, LocateFixed, Map, MapPin, Minus, Plus } from 'lucide-react';
import { photos } from '../../data/demo';

export function IllustrativeMap({
  variant = 'explore',
}: {
  variant?: 'explore' | 'home' | 'ride';
}) {
  const [zoom, setZoom] = useState(1);
  const [style, setStyle] = useState('satellite');
  return (
    <div
      className={`illustrative-map map-${variant} ${style === 'relief' ? 'map-relief' : ''}`}
      role="region"
      aria-label="Mapa ilustrativo de Alagoas. Não utilizar para navegação."
    >
      <div className="map-layer" style={{ transform: `scale(${zoom})` }}>
        <img src={photos.terrain} className="map-terrain" alt="" />
        <svg viewBox="0 0 700 390" preserveAspectRatio="none" aria-hidden>
          <path
            className="map-route"
            d={
              variant === 'explore'
                ? 'M145 328 Q165 300 180 310 T207 286 Q218 275 240 282 T265 267 Q280 280 295 253 T320 252 Q337 225 354 241 T387 223 Q410 237 430 205'
                : 'M145 328 Q165 300 180 310 T207 286 Q218 275 240 282 T265 267 Q280 280 295 253 T320 252 Q337 225 354 241 T387 223 Q410 237 430 205 T442 155 Q423 135 452 126 T491 132 Q510 121 516 91 T560 62'
            }
          />
          {variant === 'explore' && (
            <>
              <path
                className="map-route map-route-orange"
                d="M225 329 250 337 270 313 291 320 311 295 340 270 362 261 374 239"
              />
              <path
                className="map-route map-route-blue"
                d="M382 236 410 217 430 205 421 180 442 155 429 138 452 126 468 128"
              />
              <path
                className="map-route map-route-pink"
                d="M468 128 491 132 510 109 516 91 538 82 560 62"
              />
            </>
          )}
        </svg>
        {(variant === 'explore'
          ? [
              { x: 145, y: 328, text: 'Maceió', color: '#ff2534' },
              { x: 340, y: 270, text: 'Barra de São Miguel', color: '#ff921d' },
              { x: 430, y: 205, text: 'Praia do Francês', color: '#327aff' },
              { x: 560, y: 62, text: 'Maragogi', color: '#ff2544' },
            ]
          : [
              { x: 145, y: 328, text: 'Maceió', color: '#ff2534' },
              {
                x: 560,
                y: 62,
                text:
                  variant === 'ride'
                    ? 'Praia do Francês'
                    : 'Barra de São Miguel',
                color: '#ff2534',
              },
            ]
        ).map((p) => (
          <span
            className={`map-marker ${p.x > 500 ? 'map-marker-end' : ''} ${p.x === 430 ? 'map-marker-near-controls' : ''}`}
            key={p.text}
            style={{
              left: `${(p.x / 700) * 100}%`,
              top: `${(p.y / 390) * 100}%`,
            }}
          >
            <i style={{ background: p.color }}>
              {variant !== 'explore' && p.x > 500 && (
                <Flag size={22} fill="white" />
              )}
            </i>
            <span>{p.text}</span>
          </span>
        ))}
        <span className="map-region-label">ALAGOAS</span>
      </div>
      {variant === 'explore' && (
        <div className="map-caption">
          <Map size={28} />
          <div>
            <strong>ALAGOAS</strong>
            <p>
              Rotas incríveis entre praias,
              <br />
              serras e curvas do litoral.
            </p>
          </div>
        </div>
      )}
      {variant !== 'explore' && (
        <div className="map-panel-title">
          <MapPin size={19} />
          <span>
            {variant === 'ride' ? 'MAPA AO VIVO · PRÉVIA' : 'MAPA ILUSTRATIVO'}
          </span>
        </div>
      )}
      <div className="map-controls">
        <button
          className="icon-button"
          aria-label="Centralizar mapa ilustrativo"
          onClick={() => setZoom(1)}
        >
          <LocateFixed />
        </button>
        {variant === 'explore' && (
          <>
            <button
              className="icon-button"
              aria-label="Ampliar mapa ilustrativo"
              disabled={zoom >= 1.6}
              onClick={() => setZoom(Math.min(1.6, zoom + 0.2))}
            >
              <Plus />
            </button>
            <button
              className="icon-button"
              aria-label="Reduzir mapa ilustrativo"
              disabled={zoom <= 1}
              onClick={() => setZoom(Math.max(1, zoom - 0.2))}
            >
              <Minus />
            </button>
          </>
        )}
      </div>
      <span className="map-disclaimer">Mapa ilustrativo · sem GPS</span>
      {variant === 'explore' && (
        <label className="map-style">
          <span className="sr-only">Estilo do mapa ilustrativo</span>
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="satellite">Satélite</option>
            <option value="relief">Relevo</option>
          </select>
        </label>
      )}
    </div>
  );
}
