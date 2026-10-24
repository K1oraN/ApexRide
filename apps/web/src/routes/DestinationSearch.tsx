import { useEffect, useState } from 'react';
import { validCoordinate, type Coordinate } from '@apex-ride/ride-core/routes';
import { MapPin, Plus, Search } from 'lucide-react';
import { Button, Input } from '../components/design-system';
import { routeService } from '../services/routes';
import '../styles/navigation.css';
export function DestinationSearch({
  onSelect,
  disabled = false,
}: {
  onSelect: (point: Coordinate, label: string) => void;
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(false),
    [query, setQuery] = useState(''),
    [lat, setLat] = useState(''),
    [lon, setLon] = useState('');
  const [places, setPlaces] = useState<
      { id: string; label: string; coordinate: Coordinate }[]
    >([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void routeService
      .providers()
      .then((p) => {
        if (live) setEnabled(p.geocoding);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  async function search() {
    setBusy(true);
    setMessage('');
    setPlaces([]);
    try {
      const result = await routeService.destinations(query);
      setPlaces(result.places);
      setMessage(
        result.places.length
          ? result.attribution
          : 'Nenhum destino encontrado. Refine o endereço ou use coordenadas.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="destination-search">
      {enabled ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
          className="route-tools"
        >
          <label>
            Buscar destino
            <Input
              placeholder="Cidade, endereço ou ponto de interesse"
              value={query}
              maxLength={160}
              onChange={(e) => {
                setQuery(e.target.value);
                setPlaces([]);
              }}
            />
          </label>
          <Button
            type="submit"
            disabled={disabled || busy || query.trim().length < 3}
          >
            <Search size={17} aria-hidden />
            Buscar endereço
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery('');
              setPlaces([]);
              setMessage('');
            }}
          >
            Limpar busca
          </Button>
        </form>
      ) : (
        <div className="destination-provider-status">
          <MapPin size={18} aria-hidden />
          <span>Busca de endereços indisponível</span>
        </div>
      )}
      {busy && <p role="status">Buscando destinos…</p>}
      {message && <p role="status">{message}</p>}
      {places.length > 0 && (
        <ul className="destination-results" aria-label="Destinos encontrados">
          {places.map((p) => (
            <li key={p.id}>
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() => {
                  onSelect(p.coordinate, p.label);
                  setPlaces([]);
                }}
              >
                {p.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>
          <MapPin size={18} aria-hidden />
          Usar coordenadas
        </summary>
        <form
          className="coordinate-form"
          onSubmit={(e) => {
            e.preventDefault();
            const point = [Number(lon), Number(lat)];
            if (!lat.trim() || !lon.trim() || !validCoordinate(point)) {
              setMessage(
                'Informe latitude de −85 a 85 e longitude de −180 a 180, com ponto decimal.',
              );
              return;
            }
            onSelect(point, `${lat}, ${lon}`);
            setMessage('Ponto adicionado.');
          }}
        >
          <label>
            Latitude
            <Input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
              placeholder="−9.65"
            />
          </label>
          <label>
            Longitude
            <Input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              inputMode="decimal"
              placeholder="−35.73"
            />
          </label>
          <Button variant="secondary" disabled={disabled}>
            <Plus size={17} aria-hidden />
            Adicionar coordenada
          </Button>
        </form>
      </details>
    </div>
  );
}
