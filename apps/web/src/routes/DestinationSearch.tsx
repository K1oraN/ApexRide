import { useEffect, useRef, useState } from 'react';
import { validCoordinate, type Coordinate } from '@apex-ride/ride-core/routes';
import {
  AlertCircle,
  CheckCircle2,
  MapPin,
  Navigation,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Button, Input } from '../components/design-system';
import { routeService } from '../services/routes';
import '../styles/navigation.css';
import '../styles/apex-stage-03.css';

type Place = {
  id: string;
  label: string;
  coordinate: Coordinate;
};

type Props = {
  onSelect: (point: Coordinate, label: string) => void;
  disabled?: boolean;
};

/**
 * Manual address lookup. Never auto-completes, never sends coordinates until
 * the user selects a result, and does not silently fall back to another API.
 * Server-side provider credentials are never exposed to the browser.
 */
export function DestinationSearch({ onSelect, disabled = false }: Props) {
  const [providerReady, setProviderReady] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [routing, setRouting] = useState(false);
  const [query, setQuery] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'info' | 'error' | 'success'>(
    'info',
  );
  const [busy, setBusy] = useState(false);
  const version = useRef(0);

  useEffect(() => {
    let active = true;
    void routeService
      .providers()
      .then((provider) => {
        if (!active) return;
        setGeocoding(provider.geocoding);
        setRouting(provider.routing);
        setProviderReady(true);
      })
      .catch(() => {
        if (!active) return;
        setGeocoding(false);
        setRouting(false);
        setProviderReady(true);
      });
    return () => {
      active = false;
      version.current += 1;
    };
  }, []);

  function resetMessage() {
    setMessage('');
    setMessageKind('info');
  }

  function clearSearch() {
    version.current += 1;
    setQuery('');
    setPlaces([]);
    setBusy(false);
    resetMessage();
  }

  async function search() {
    const text = query.trim();
    if (disabled || busy || !geocoding || text.length < 3) return;
    const request = ++version.current;
    setBusy(true);
    resetMessage();
    setPlaces([]);
    try {
      const result = await routeService.destinations(text);
      if (request !== version.current) return;
      setPlaces(result.places);
      setMessage(
        result.places.length
          ? result.attribution
          : 'Nenhum resultado. Experimente rua, cidade e UF.',
      );
      setMessageKind('info');
    } catch (error) {
      if (request !== version.current) return;
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível encontrar o endereço.',
      );
      setMessageKind('error');
    } finally {
      if (request === version.current) setBusy(false);
    }
  }

  function choose(place: Place) {
    version.current += 1;
    onSelect(place.coordinate, place.label);
    setQuery(place.label);
    setPlaces([]);
    setBusy(false);
    setMessage('Local adicionado ao planejamento.');
    setMessageKind('success');
  }

  function addCoordinates() {
    const lat = Number(latitude.trim().replace(',', '.'));
    const lon = Number(longitude.trim().replace(',', '.'));
    const point: Coordinate = [lon, lat];
    if (!latitude.trim() || !longitude.trim() || !validCoordinate(point)) {
      setMessage('Latitude válida: −85 a 85. Longitude válida: −180 a 180.');
      setMessageKind('error');
      return;
    }
    onSelect(point, `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    setLatitude('');
    setLongitude('');
    setMessage(
      'Coordenada adicionada. Inclua pelo menos dois pontos para calcular a rota.',
    );
    setMessageKind('success');
  }

  return (
    <div className="destination-search destination-search-premium apex-destination-v3">
      <section
        className="destination-address-search"
        aria-label="Pesquisa de endereços"
      >
        <div className="destination-search-heading">
          <span className="destination-search-icon" aria-hidden="true">
            <Search size={23} />
          </span>
          <div>
            <strong>Encontre seu destino</strong>
            <small>
              Busque uma cidade, endereço ou ponto de interesse no Brasil.
            </small>
          </div>
        </div>

        <form
          className="destination-address-form"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <label
            className="apex-address-field"
            htmlFor="apex-destination-query"
          >
            Endereço ou local
            <Input
              id="apex-destination-query"
              type="search"
              placeholder="Ex.: Praia do Francês, Marechal Deodoro - AL"
              autoComplete="street-address"
              value={query}
              maxLength={160}
              disabled={disabled || !geocoding || busy}
              onChange={(event) => {
                version.current += 1;
                setQuery(event.target.value);
                setPlaces([]);
                setBusy(false);
                resetMessage();
              }}
            />
          </label>
          <div className="destination-address-actions">
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={
                disabled || !geocoding || busy || query.trim().length < 3
              }
            >
              <Search size={19} aria-hidden="true" />{' '}
              {busy ? 'Pesquisando…' : 'Buscar endereço'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || (!query && !places.length) || busy}
              onClick={clearSearch}
            >
              <X size={19} aria-hidden="true" /> Limpar
            </Button>
          </div>
        </form>

        {!providerReady && (
          <p className="apex-provider-feedback" role="status">
            Verificando serviços de pesquisa e roteamento…
          </p>
        )}
        {providerReady && !geocoding && (
          <div className="apex-provider-feedback is-warning" role="status">
            <AlertCircle size={20} aria-hidden="true" />
            <span>
              <strong>Busca por endereço indisponível nesta instalação.</strong>{' '}
              O administrador precisa autorizar a geocodificação e configurar
              uma chave MapTiler válida. Você ainda pode adicionar coordenadas
              ou selecionar pontos no mapa.
            </span>
          </div>
        )}
        {busy && (
          <p className="apex-provider-feedback" role="status">
            Pesquisando endereços no Brasil…
          </p>
        )}
        {places.length > 0 && (
          <ul
            className="destination-results"
            aria-label="Endereços encontrados"
          >
            {places.map((place) => (
              <li key={place.id || place.label}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => choose(place)}
                >
                  <MapPin size={18} aria-hidden="true" />
                  <span>{place.label}</span>
                  <Plus size={16} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p
            className={`destination-search-message is-${messageKind}`}
            role="status"
          >
            {message}
          </p>
        )}
      </section>

      <details className="destination-coordinates">
        <summary>
          <MapPin size={19} aria-hidden="true" />
          <span>Adicionar ponto pelas coordenadas</span>
          <Plus size={18} aria-hidden="true" />
        </summary>
        <div className="destination-coordinates-content">
          <p>
            Use a sequência origem → paradas → destino. A rota por ruas exige um
            provedor de roteamento ativo.
          </p>
          <form
            className="coordinate-form"
            onSubmit={(event) => {
              event.preventDefault();
              addCoordinates();
            }}
          >
            <label>
              Latitude
              <Input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="-9.65000"
                disabled={disabled}
                required
              />
            </label>
            <label>
              Longitude
              <Input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="-35.73000"
                disabled={disabled}
                required
              />
            </label>
            <Button type="submit" variant="secondary" disabled={disabled}>
              <Plus size={18} aria-hidden="true" /> Adicionar ponto
            </Button>
          </form>
        </div>
      </details>

      {providerReady && (
        <div
          className={`apex-routing-status ${routing ? 'is-ready' : 'is-warning'}`}
          role="status"
        >
          {routing ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : (
            <AlertCircle size={18} aria-hidden="true" />
          )}
          <span>
            {routing
              ? 'Provedor de rotas configurado. Cálculos dependem da disponibilidade do serviço.'
              : 'Cálculo pelas ruas e instruções indisponíveis até configurar o OSRM.'}
          </span>
          {routing && <Navigation size={18} aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
