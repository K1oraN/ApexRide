import { Globe2, Lock, UsersRound, Users, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RouteRecord } from '@apex-ride/ride-core/routes';
import { authRequest } from '../services/auth';
import { routeService, type RouteVisibility } from '../services/routes';
import '../styles/apex-stage-04.css';

interface GroupOption {
  id: string;
  name: string;
  status: string;
  member_status: string | null;
  role: string | null;
  rules_version: number;
  accepted_rules_version: number | null;
  posting_policy: string;
}
const choices: {
  visibility: RouteVisibility;
  title: string;
  description: string;
  icon: typeof Lock;
}[] = [
  {
    visibility: 'private',
    title: 'Privado',
    description: 'Somente voce',
    icon: Lock,
  },
  {
    visibility: 'public',
    title: 'Publico',
    description: 'Visivel para todos',
    icon: Globe2,
  },
  {
    visibility: 'followers',
    title: 'Seguidores',
    description: 'Apenas seguidores aprovados',
    icon: Users,
  },
  {
    visibility: 'group',
    title: 'Grupo / comunidade',
    description: 'Membros do grupo',
    icon: UsersRound,
  },
];
export function RoutePublishPanel({
  route,
  onUpdated,
}: {
  route: RouteRecord;
  onUpdated: () => void;
}) {
  const [visibility, setVisibility] = useState<RouteVisibility>(
    route.visibility ?? 'private',
  );
  const [groupId, setGroupId] = useState(route.groupId ?? '');
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setVisibility(route.visibility ?? 'private');
    setGroupId(route.groupId ?? '');
  }, [route.id, route.visibility, route.groupId]);
  useEffect(() => {
    if (visibility !== 'group') return;
    let active = true;
    setLoadingGroups(true);
    void authRequest<{ items: GroupOption[] }>(
      '/groups/mine?filter=mine&limit=50',
    )
      .then((result) => {
        if (active) setGroups(result.items ?? []);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoadingGroups(false);
      });
    return () => {
      active = false;
    };
  }, [visibility]);
  const eligibleGroups = groups.filter(
    (group) =>
      group.status === 'active' &&
      group.member_status === 'active' &&
      group.accepted_rules_version === group.rules_version &&
      !(group.posting_policy === 'staff' && group.role === 'member'),
  );
  async function savePublication() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (visibility === 'group' && !groupId)
        throw new Error('Escolha um grupo antes de publicar.');
      await routeService.publish(
        route.id,
        visibility,
        visibility === 'group' ? groupId : null,
      );
      setMessage(
        visibility === 'private' ? 'Percurso privado.' : 'Percurso publicado!',
      );
      onUpdated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Nao foi possivel publicar.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="apex-route-publication"
      aria-label="Compartilhamento do percurso"
    >
      <div className="apex-route-publication-heading">
        <ShieldCheck aria-hidden="true" size={23} />
        <div>
          <h2>Salvar e compartilhar</h2>
          <p>
            Escolha quem pode ver seu percurso. Sem aprovacao previa de
            administrador.
          </p>
        </div>
      </div>
      <div
        className="apex-route-visibility-grid"
        role="radiogroup"
        aria-label="Visibilidade do percurso"
      >
        {choices.map(
          ({ visibility: value, title, description, icon: Icon }) => (
            <label
              key={value}
              className={visibility === value ? 'is-selected' : ''}
            >
              <input
                type="radio"
                name={`visibility-${route.id}`}
                value={value}
                checked={visibility === value}
                disabled={busy}
                onChange={() => {
                  setVisibility(value);
                  setError('');
                }}
              />
              <Icon aria-hidden="true" size={21} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </label>
          ),
        )}
      </div>
      {visibility === 'group' && (
        <label className="apex-route-group-select">
          Compartilhar com qual grupo?
          <select
            value={groupId}
            disabled={busy || loadingGroups}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">
              {loadingGroups ? 'Carregando grupos...' : 'Selecione um grupo'}
            </option>
            {eligibleGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          {!loadingGroups && !eligibleGroups.length && (
            <small>
              Nenhum grupo habilitado para voce publicar. Confira suas
              participacoes e regras.
            </small>
          )}
        </label>
      )}
      <button
        className="apex-route-publish-button"
        type="button"
        disabled={busy || route.status === 'archived'}
        onClick={() => void savePublication()}
      >
        {busy
          ? 'Salvando...'
          : visibility === 'private'
            ? 'Salvar como privado'
            : 'Publicar percurso'}
      </button>
      {error && (
        <p role="alert" className="apex-route-publish-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="apex-route-publish-success">
          {message}
        </p>
      )}
      {route.kind === 'circuit' && (
        <p className="apex-route-publication-caveat">
          Publicar um circuito nao significa homologar seus resultados de pista.
          A verificacao tecnica continua independente.
        </p>
      )}
    </section>
  );
}
