
import { useEffect, useRef, useState } from 'react';
import {
  validCoordinate,
  type Coordinate,
} from '@apex-ride/ride-core/routes';
import {
  MapPin,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  Button,
  Input,
} from '../components/design-system';
import { routeService } from '../services/routes';
import '../styles/navigation.css';

type Place = {
  id: string;
  label: string;
  coordinate: Coordinate;
};

type Props = {
  onSelect: (point: Coordinate, label: string) => void;
  disabled?: boolean;
};

export function DestinationSearch({
  onSelect,
  disabled = false,
}: Props) {
  const [providerReady, setProviderReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [query, setQuery] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const requestVersion = useRef(0);

  useEffect(() => {
    let live = true;

    void routeService
      .providers()
      .then((provider) => {
        if (!live) return;
        setEnabled(provider.geocoding);
        setProviderReady(true);
      })
      .catch(() => {
        if (!live) return;
        setEnabled(false);
        setProviderReady(true);
      });

    return () => {
      live = false;
      requestVersion.current += 1;
    };
  }, []);

  function clearSearch() {
    requestVersion.current += 1;
    setQuery('');
    setPlaces([]);
    setMessage('');
    setBusy(false);
  }

  async function search() {
    if (!enabled || disabled || query.trim().length < 3) {
      return;
    }

    const version = ++requestVersion.current;

    setBusy(true);
    setMessage('');
    setPlaces([]);

    try {
      const result = await routeService.destinations(
        query.trim(),
      );

      if (version !== requestVersion.current) return;

      setPlaces(result.places);

      setMessage(
        result.places.length
          ? result.attribution
          : 'Nenhum endereço encontrado. Tente informar rua, cidade e estado.',
      );
    } catch (error) {
      if (version !== requestVersion.current) return;

      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível pesquisar este endereço.',
      );
    } finally {
      if (version === requestVersion.current) {
        setBusy(false);
      }
    }
  }

  function addCoordinates() {
    const latitude = Number(lat.trim().replace(',', '.'));
    const longitude = Number(lon.trim().replace(',', '.'));

    const point: Coordinate = [longitude, latitude];

    if (
      !lat.trim() ||
      !lon.trim() ||
      !validCoordinate(point)
    ) {
      setMessage(
        'Informe latitude entre −85 e 85 e longitude entre −180 e 180.',
      );
      return;
    }

    onSelect(
      point,
      `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    );

    setLat('');
    setLon('');
    setMessage(
      'Coordenada enviada ao planejamento. Você pode adicionar outros pontos.',
    );
  }

  return (
    <div className="destination-search destination-search-premium">
      <section
        className="destination-address-search"
        aria-label="Busca de endereços"
      >
        <div className="destination-search-heading">
          <span className="destination-search-icon">
            <Search size={20} aria-hidden="true" />
          </span>

          <div>
            <strong>Encontrar endereço</strong>
            <small>
              Pesquise uma cidade, rua ou ponto de interesse.
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
          <label>
            Endereço ou local
            <Input
              type="search"
              placeholder="Ex.: Avenida, bairro, cidade e UF"
              value={query}
              maxLength={160}
              disabled={
                disabled || !enabled || busy
              }
              onChange={(event) => {
                requestVersion.current += 1;
                setQuery(event.target.value);
                setPlaces([]);
                setMessage('');
                setBusy(false);
              }}
            />
          </label>

          <div className="destination-address-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={
                disabled ||
                !enabled ||
                busy ||
                query.trim().length < 3
              }
              loading={busy}
            >
              <Search size={17} aria-hidden="true" />
              Buscar endereço
            </Button>

            <Button
              type="button"
              variant="ghost"
              disabled={disabled || busy}
              onClick={clearSearch}
            >
              <X size={17} aria-hidden="true" />
              Limpar
            </Button>
          </div>
        </form>

        {providerReady && !enabled && (
          <div
            className="destination-provider-status"
            role="status"
          >
            <MapPin size={18} aria-hidden="true" />
            <span>
              A pesquisa por endereço precisa ser ativada
              pelo administrador. Enquanto isso, use
              coordenadas ou selecione pontos no mapa.
            </span>
          </div>
        )}

        {!providerReady && (
          <p role="status">
            Verificando disponibilidade da busca…
          </p>
        )}

        {busy && (
          <p role="status">
            Buscando endereços…
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
                  onClick={() => {
                    onSelect(
                      place.coordinate,
                      place.label,
                    );

                    setQuery(place.label);
                    setPlaces([]);
                    setMessage('');
                  }}
                >
                  <MapPin
                    size={17}
                    aria-hidden="true"
                  />
                  <span>{place.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="destination-coordinates">
        <summary>
          <MapPin size={18} aria-hidden="true" />
          <span>Adicionar pelas coordenadas</span>
        </summary>

        <div className="destination-coordinates-content">
          <p>
            Informe os pontos em sequência: origem,
            paradas intermediárias e destino. É possível
            adicionar mais de um ponto.
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
                value={lat}
                onChange={(event) =>
                  setLat(event.target.value)
                }
                inputMode="decimal"
                autoComplete="off"
                placeholder="-9.65"
                disabled={disabled}
                required
              />
            </label>

            <label>
              Longitude
              <Input
                value={lon}
                onChange={(event) =>
                  setLon(event.target.value)
                }
                inputMode="decimal"
                autoComplete="off"
                placeholder="-35.73"
                disabled={disabled}
                required
              />
            </label>

            <Button
              type="submit"
              variant="secondary"
              disabled={disabled}
            >
              <Plus
                size={17}
                aria-hidden="true"
              />
              Adicionar outro ponto
            </Button>
          </form>
        </div>
      </details>

      {message && (
        <p
          className="destination-search-message"
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
