import {
  CatalogPicker,
  type DirectorySelection,
} from '../garage/CatalogPicker';
import { GaragePremium, GarageHero } from '../garage/GaragePremium';
import { GarageDetails } from '../garage/GarageDetails';
import type { CatalogVariant } from '../services/catalog';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Field } from '../components/AccountFields';
import {
  Button,
  ButtonLink,
  Checkbox,
  Dialog,
  ChoiceSelect,
} from '../components/design-system';
import { useGarage } from '../garage/context';
import { MotorcyclePhoto } from '../garage/MotorcycleCard';
import {
  motorcycleService,
  validatePhoto,
  type Motorcycle,
} from '../services/motorcycles';

export function GaragePage() {
  return <GaragePremium />;
}

export function MotorcyclePage({ edit = false }: { edit?: boolean }) {
  const { id } = useParams();
  const archived =
    new URLSearchParams(useLocation().search).get('archived') === 'true';
  return (
    <MotorcycleView
      key={`${id ?? 'new'}:${edit}`}
      id={id}
      edit={edit}
      archived={archived}
    />
  );
}

function MotorcycleView({
  id,
  edit,
  archived = false,
}: {
  id: string | undefined;
  edit: boolean;
  archived?: boolean;
}) {
  const { refresh } = useGarage();
  const navigate = useNavigate();
  const location = useLocation();
  const [bike, setBike] = useState<Motorcycle | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'archive' | 'permanent'>(
    'archive',
  );
  const confirmButton = useRef<HTMLButtonElement>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void motorcycleService
      .detail(id, archived)
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
  }, [id, retry, archived]);
  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);
  async function action(remove: boolean, permanently = false) {
    if (!bike || busy) return;
    setBusy(true);
    setError('');
    try {
      if (remove) {
        if (permanently) await motorcycleService.deletePermanently(bike.id);
        else await motorcycleService.remove(bike.id);
      } else setBike((await motorcycleService.setPrimary(bike.id)).motorcycle);
      await refresh();
      if (remove)
        navigate('/garagem', {
          replace: true,
          state: {
            message: permanently
              ? 'Moto excluída definitivamente.'
              : 'Moto arquivada. Registros preservados.',
          },
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
    <section className="motorcycle-detail motorcycle-workspace">
      <Link className="text-link action-link" to="/garagem">
        <ArrowLeft size={18} />
        Voltar para a garagem
      </Link>
      <GarageHero bike={bike!} manage={false} />
      {location.state?.message && <p role="status">{location.state.message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!bike!.archivedAt && (
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
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setDeleteMode('archive');
              setConfirming(true);
            }}
          >
            Arquivar moto
          </Button>
        </div>
      )}
      <div className="garage-stage06-permanent-row">
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => {
            setDeleteMode('permanent');
            setConfirming(true);
          }}
        >
          Excluir definitivamente
        </Button>
        <small>
          A exclusão permanente exige que não existam atividades Ride vinculadas
          à moto.
        </small>
      </div>
      <GarageDetails bike={bike!} />
      <Dialog
        open={confirming}
        dismissible={!busy}
        onClose={() => {
          if (!busy) setConfirming(false);
        }}
        title={`${deleteMode === 'permanent' ? 'Excluir definitivamente' : 'Arquivar'} ${bike!.brand} ${bike!.model}?`}
      >
        <p>
          {deleteMode === 'permanent'
            ? 'Esta ação é irreversível: elimina a moto, registros privados e fotografia. Se houver atividades Ride associadas, o servidor bloqueará a exclusão para preservar seu histórico.'
            : 'A moto será arquivada e ficará fora da garagem principal. Seus dados históricos serão preservados. Se for a principal, outra moto será selecionada.'}
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
            onClick={() => void action(true, deleteMode === 'permanent')}
          >
            {busy
              ? 'Processando…'
              : deleteMode === 'permanent'
                ? 'Excluir definitivamente'
                : 'Confirmar arquivamento'}
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
  const [propulsion, setPropulsion] = useState<'combustion' | 'electric'>(
    bike?.propulsion ?? 'combustion',
  );
  const [manufactureYear, setManufactureYear] = useState(
    String(bike?.manufactureYear ?? ''),
  );
  const [versionName, setVersionName] = useState(bike?.versionName ?? '');
  const [catalog, setCatalog] = useState<{
    id: string;
    revision: number;
  } | null>(
    bike?.catalogVariantId && bike.catalogRevision
      ? { id: bike.catalogVariantId, revision: bike.catalogRevision }
      : null,
  );
  const [showCatalog, setShowCatalog] = useState(!bike);
  function selectCatalog(v: CatalogVariant) {
    setBrand(v.brand);
    setModel(v.model);
    setYear(String(v.model_year));
    setVersionName(v.name);
    setPropulsion(v.propulsion);
    setCc(
      v.specifications.displacement
        ? String(v.specifications.displacement.value)
        : '',
    );
    setCatalog({ id: v.id, revision: v.revision });
    setShowCatalog(false);
  }

  function selectDirectory(selection: DirectorySelection) {
    // Directory entries are names only: do not invent a technical revision,
    // engine size, propulsion type or model-year availability.
    setBrand(selection.brand);
    setModel(selection.model);
    setYear(String(selection.year));
    setVersionName('');
    setCatalog(null);
    setCc('');
    setPropulsion('combustion');
    setShowCatalog(false);
    setError('');
  }

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
      displacementCc: propulsion === 'electric' ? null : Number(cc),
      propulsion,
      manufactureYear: manufactureYear ? Number(manufactureYear) : null,
      versionName,
      catalogVariantId: catalog?.id ?? null,
      catalogRevision: catalog?.revision ?? null,
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
      propulsion === 'combustion' &&
      (data.displacementCc === null ||
        !Number.isFinite(data.displacementCc) ||
        data.displacementCc < 1 ||
        data.displacementCc > 10000)
    ) {
      setError('Informe cilindrada entre 1 e 10000 cc.');
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
      {showCatalog ? (
        <CatalogPicker
          onSelect={selectCatalog}
          onDirectorySelect={selectDirectory}
          onManual={() => setShowCatalog(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowCatalog(true)}
        >
          Buscar ou trocar versão no catálogo
        </Button>
      )}
      {catalog && (
        <p className="catalog-link-state">
          Versão de catálogo · revisão {catalog.revision}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setCatalog(null)}
          >
            Desvincular e manter dados
          </Button>
        </p>
      )}
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
          <div className="account-field">
            <span>Propulsão</span>
            <ChoiceSelect
              aria-label="Propulsão"
              value={propulsion}
              onChange={(e) =>
                setPropulsion(e.target.value as 'combustion' | 'electric')
              }
            >
              <option value="combustion">Combustão</option>
              <option value="electric">Elétrica</option>
            </ChoiceSelect>
          </div>
          {propulsion === 'combustion' ? (
            <Field
              label="Cilindrada (cc)"
              name="displacementCc"
              type="number"
              inputMode="decimal"
              required
              min={1}
              max={10000}
              step={0.01}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          ) : (
            <p>Propulsão elétrica · sem cilindrada.</p>
          )}
          <Field
            label="Versão (opcional)"
            value={versionName}
            maxLength={100}
            onChange={(e) => setVersionName(e.target.value)}
          />
          <Field
            label="Ano de fabricação (opcional)"
            type="number"
            min={1885}
            max={maxYear}
            step={1}
            value={manufactureYear}
            onChange={(e) => setManufactureYear(e.target.value)}
          />
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
