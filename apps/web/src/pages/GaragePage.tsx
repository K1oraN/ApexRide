import { ArrowLeft, Plus } from 'lucide-react';
import { RideIcon } from '../components/Brand';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Field } from '../components/AccountFields';
import {
  Button,
  ButtonLink,
  Checkbox,
  Dialog,
  EmptyState,
  PageHeader,
} from '../components/design-system';
import { Chip } from '../components/ui';
import { useGarage } from '../garage/context';
import { MotorcycleCard, MotorcyclePhoto } from '../garage/MotorcycleCard';
import {
  motorcycleService,
  validatePhoto,
  type Motorcycle,
} from '../services/motorcycles';

export function GaragePage() {
  const { user, status } = useAuth();
  const { motorcycles, loading, error, refresh } = useGarage();
  const location = useLocation();
  return (
    <div className="garage-page">
      <PageHeader
        title="Minha"
        accent="Garagem"
        description="Suas motos. Suas próximas aventuras."
        action={
          user && motorcycles.length > 0 ? (
            <ButtonLink variant="primary" size="lg" to="/garagem/nova">
              <Plus size={20} />
              Adicionar Moto
            </ButtonLink>
          ) : undefined
        }
      />
      {location.state?.message && (
        <p className="form-message" role="status">
          {location.state.message}
        </p>
      )}
      {status === 'loading' || (user && loading) ? (
        <p role="status">Carregando garagem…</p>
      ) : !user ? (
        <section className="garage-empty panel">
          <RideIcon size={52} />
          <h2>Sua garagem começa aqui</h2>
          <p>
            Entre na sua conta para cadastrar e gerenciar suas motocicletas.
          </p>
          <ButtonLink variant="primary" to="/entrar?retorno=%2Fgaragem">
            Entrar na conta
          </ButtonLink>
        </section>
      ) : error ? (
        <section className="garage-empty panel">
          <p role="alert">{error}</p>
          <Button variant="secondary" onClick={() => void refresh()}>
            Tentar novamente
          </Button>
        </section>
      ) : motorcycles.length ? (
        <div className="motorcycle-grid">
          {motorcycles.map((bike) => (
            <MotorcycleCard bike={bike} key={bike.id} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="garage-empty"
          title="Sua garagem está vazia."
          icon={<RideIcon size={32} />}
          action={
            <ButtonLink variant="primary" size="lg" to="/garagem/nova">
              Cadastrar primeira moto
            </ButtonLink>
          }
        >
          Cadastre sua primeira moto para começar sua jornada no Apex Ride.
        </EmptyState>
      )}
    </div>
  );
}

export function MotorcyclePage({ edit = false }: { edit?: boolean }) {
  const { id } = useParams();
  return <MotorcycleView key={`${id ?? 'new'}:${edit}`} id={id} edit={edit} />;
}

function MotorcycleView({
  id,
  edit,
}: {
  id: string | undefined;
  edit: boolean;
}) {
  const { refresh } = useGarage();
  const navigate = useNavigate();
  const location = useLocation();
  const [bike, setBike] = useState<Motorcycle | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void motorcycleService
      .detail(id)
      .then((data) => {
        if (active) {
          setBike(data.motorcycle);
          setLoading(false);
          setError('');
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : 'Não foi possível carregar a moto.',
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);
  async function action(remove: boolean) {
    if (!bike || busy) return;
    setBusy(true);
    setError('');
    try {
      if (remove) await motorcycleService.remove(bike.id);
      else setBike((await motorcycleService.setPrimary(bike.id)).motorcycle);
      await refresh();
      if (remove)
        navigate('/garagem', {
          replace: true,
          state: { message: 'Moto excluída da garagem.' },
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Carregando moto…</p>;
  if (id && !bike)
    return (
      <section className="account-card panel">
        <h1>Moto indisponível</h1>
        <p role="alert">{error}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            setRetry(retry + 1);
          }}
        >
          Tentar novamente
        </Button>
        <Link className="text-link action-link" to="/garagem">
          Voltar para a garagem
        </Link>
      </section>
    );
  if (edit || !id) return <MotorcycleForm key={id ?? 'new'} bike={bike} />;
  return (
    <section className="motorcycle-detail panel">
      <Link className="text-link action-link" to="/garagem">
        <ArrowLeft size={18} />
        Voltar para a garagem
      </Link>
      <MotorcyclePhoto bike={bike!} />
      <div>
        <span className="eyebrow">{bike!.brand}</span>
        <h1>{bike!.model}</h1>
      </div>
      <p>
        {bike!.year} · {bike!.displacementCc} cc
      </p>
      {bike!.isPrimary && <Chip accent>Moto principal</Chip>}
      {location.state?.message && <p role="status">{location.state.message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="garage-actions">
        <ButtonLink variant="secondary" to={`/garagem/${id}/editar`}>
          Editar moto
        </ButtonLink>
        {!bike!.isPrimary && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void action(false)}
          >
            {busy ? 'Salvando…' : 'Definir como principal'}
          </Button>
        )}
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Excluir moto
        </Button>
      </div>
      <Dialog
        open={confirming}
        dismissible={!busy}
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
        title={`Excluir ${bike!.brand} ${bike!.model}?`}
      >
        <p>
          A moto e sua fotografia serão removidas da garagem. Se ela for a
          principal, outra moto será selecionada.
        </p>
        <div
          className="ui-dialog-actions"
          role="group"
          aria-label="Confirmar exclusão"
        >
          <Button
            ref={confirmButton}
            variant="outline"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={busy}
            disabled={busy}
            onClick={() => void action(true)}
          >
            {busy ? 'Excluindo…' : 'Confirmar exclusão'}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

function MotorcycleForm({ bike }: { bike: Motorcycle | null }) {
  const { refresh } = useGarage();
  const navigate = useNavigate();
  const [brand, setBrand] = useState(bike?.brand ?? '');
  const [model, setModel] = useState(bike?.model ?? '');
  const [year, setYear] = useState(String(bike?.year ?? ''));
  const [cc, setCc] = useState(String(bike?.displacementCc ?? ''));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoInputVersion, setPhotoInputVersion] = useState(0);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [savedId, setSavedId] = useState(bike?.id);
  const saving = useRef(false);
  const maxYear = new Date().getFullYear() + 1;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving.current) return;
    const data = {
      brand: brand.trim(),
      model: model.trim(),
      year: Number(year),
      displacementCc: Number(cc),
    };
    if (
      !data.brand ||
      !data.model ||
      [...data.brand].length > 60 ||
      [...data.model].length > 100 ||
      [...(data.brand + data.model)].some(
        (char) =>
          char.codePointAt(0)! < 32 ||
          (char.codePointAt(0)! >= 127 && char.codePointAt(0)! <= 159),
      )
    ) {
      setError(
        'Preencha marca (até 60 caracteres) e modelo (até 100) com textos válidos.',
      );
      return;
    }
    if (
      !Number.isInteger(data.year) ||
      data.year < 1885 ||
      data.year > maxYear
    ) {
      setError(`Informe um ano entre 1885 e ${maxYear}.`);
      return;
    }
    if (
      !Number.isInteger(data.displacementCc) ||
      data.displacementCc < 1 ||
      data.displacementCc > 10000
    ) {
      setError('Informe uma cilindrada inteira entre 1 e 10000 cc.');
      return;
    }
    if (file && validatePhoto(file)) {
      setError(validatePhoto(file)!);
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    setPhase('Salvando dados…');
    let dataSaved = false;
    try {
      const result = savedId
        ? await motorcycleService.update(savedId, data)
        : await motorcycleService.create(data);
      const motorcycleId = result.motorcycle.id;
      setSavedId(motorcycleId);
      dataSaved = true;
      if (file) {
        setPhase('Enviando fotografia…');
        await motorcycleService.upload(motorcycleId, file);
      } else if (removePhoto) {
        setPhase('Removendo fotografia…');
        await motorcycleService.removePhoto(motorcycleId);
      }
      await refresh();
      navigate(`/garagem/${motorcycleId}`, {
        replace: true,
        state: { message: bike ? 'Moto atualizada.' : 'Moto cadastrada.' },
      });
    } catch (e) {
      setError(
        `${dataSaved || savedId ? 'Os dados já salvos foram preservados. ' : ''}${e instanceof Error ? e.message : 'Não foi possível salvar.'}`,
      );
      await refresh();
    } finally {
      saving.current = false;
      setBusy(false);
      setPhase('');
    }
  }
  return (
    <section className="account-card panel motorcycle-form">
      <Link
        className="text-link action-link"
        to={savedId ? `/garagem/${savedId}` : '/garagem'}
      >
        <ArrowLeft size={18} />
        Voltar para a garagem
      </Link>
      <div>
        <span className="eyebrow">MINHA GARAGEM</span>
        <h1>{bike ? 'Editar moto' : 'Adicionar Moto'}</h1>
      </div>
      <form
        className="account-form"
        onSubmit={(e) => void submit(e)}
        aria-busy={busy}
      >
        <fieldset disabled={busy}>
          <Field
            label="Marca"
            name="brand"
            required
            maxLength={60}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Ex.: Honda"
          />
          <Field
            label="Modelo"
            name="model"
            required
            maxLength={100}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Ex.: CB 650R"
          />
          <Field
            label="Ano"
            name="year"
            type="number"
            inputMode="numeric"
            required
            min={1885}
            max={maxYear}
            step={1}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <Field
            label="Cilindrada (cc)"
            name="displacementCc"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={10000}
            step={1}
            value={cc}
            onChange={(e) => setCc(e.target.value)}
          />
          <small>Ano: 1885 a {maxYear}. Cilindrada: 1 a 10000 cc.</small>
          <Field
            key={photoInputVersion}
            label="Fotografia (opcional)"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-describedby="photo-help"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (!selected) {
                setFile(null);
                return;
              }
              const invalid = validatePhoto(selected);
              if (invalid) {
                setError(invalid);
                e.target.value = '';
                setFile(null);
                setPreview(null);
                return;
              }
              setError('');
              setRemovePhoto(false);
              setFile(selected);
              setPreview(URL.createObjectURL(selected));
            }}
          />
          <small id="photo-help">
            JPEG, PNG ou WebP, até 5 MB. HEIC não tem conversão disponível.
            Localização e metadados são removidos.
          </small>
          {file && preview ? (
            <img
              className="motorcycle-photo photo"
              src={preview}
              alt="Prévia da fotografia selecionada"
            />
          ) : (
            bike && !removePhoto && <MotorcyclePhoto bike={bike} />
          )}
          {file && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setPhotoInputVersion((value) => value + 1);
              }}
            >
              Descartar foto selecionada
            </Button>
          )}
          {bike?.photoUrl && (
            <label className="check-field">
              <Checkbox
                checked={removePhoto}
                onChange={(e) => {
                  setRemovePhoto(e.target.checked);
                  if (e.target.checked) {
                    setFile(null);
                    setPreview(null);
                    setPhotoInputVersion((value) => value + 1);
                  }
                }}
              />
              Remover fotografia atual ao salvar
            </label>
          )}
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? phase : 'Salvar moto'}
          </Button>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {busy && <p role="status">{phase}</p>}
      </form>
    </section>
  );
}
