import { useState, type SubmitEvent } from 'react';
import { StateField } from '../components/AccountFields';
import { Button, Checkbox, Input } from '../components/design-system';
import type { Preferences } from './types';
import { changeGamification, useGamification } from './useGamification';

export function RankingPreferences() {
  const { data, error, reload } = useGamification<{ preferences: Preferences }>(
    '/gamification/me/ranking-preferences',
  );
  return (
    <section className="panel gamification-card">
      <h2>Preferências avançadas dos rankings</h2>
      {error && (
        <p role="alert">
          {error}
          <Button variant="secondary" onClick={reload}>
            Tentar novamente
          </Button>
        </p>
      )}
      {data && <PreferencesForm initial={data.preferences} />}
    </section>
  );
}

function PreferencesForm({ initial }: { initial: Preferences }) {
  const [p, setP] = useState(initial),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function save(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await changeGamification(
        '/gamification/me/ranking-preferences',
        'PATCH',
        {
          optedIn: p.opted_in,
          showProgress: p.show_progress,
          showAchievements: p.show_achievements,
          circuitOptIn: p.circuit_opt_in,
          state: p.state,
          city: p.city,
          consentVersion: 'gamification-v1',
        },
      );
      setMessage('Preferências confirmadas.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void save(e)}>
      <fieldset className="gamification-preferences" disabled={busy}>
        <p>
          Ao participar, seu nome público, XP sazonal e região escolhida podem
          aparecer no ranking. Perfil privado fica fora das listas. Nenhuma
          trajetória GPS é divulgada.
        </p>
        <label>
          <Checkbox
            checked={p.opted_in}
            onChange={(e) => setP({ ...p, opted_in: e.target.checked })}
          />
          Participar dos rankings públicos
        </label>
        <label>
          <Checkbox
            checked={p.show_progress}
            onChange={(e) => setP({ ...p, show_progress: e.target.checked })}
          />
          Mostrar XP total e nível no meu perfil público
        </label>
        <label>
          <Checkbox
            checked={p.show_achievements}
            onChange={(e) =>
              setP({ ...p, show_achievements: e.target.checked })
            }
          />
          Mostrar nomes de conquistas no meu perfil público, sem origens ou
          datas
        </label>
        <label>
          <Checkbox
            checked={p.circuit_opt_in}
            onChange={(e) => setP({ ...p, circuit_opt_in: e.target.checked })}
          />
          Autorizar futura elegibilidade para resultados experimentais de
          circuitos verificados
        </label>
        <p>
          Resultados de pista continuam pessoais e estimados até validação
          técnica. Essa autorização é independente das atividades e do GPS
          social.
        </p>
        <StateField
          value={p.state}
          onChange={(state) => setP({ ...p, state, city: state ? p.city : '' })}
        />
        <label className="account-field">
          Município escolhido (opcional)
          <Input
            maxLength={80}
            disabled={!p.state}
            value={p.city}
            onChange={(e) => setP({ ...p, city: e.target.value })}
          />
        </label>
        <small>
          Região alterável a cada 30 dias. Você pode sair do ranking a qualquer
          momento, preservando XP e conquistas.
        </small>
        <label>
          <Checkbox
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Li e confirmo estas escolhas de divulgação.
        </label>
        <Button variant="primary" disabled={!consent || busy}>
          Salvar participação e privacidade
        </Button>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
