import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { similarityService } from './service';
export function SimilarGroups() {
  const [groups, setGroups] = useState<string[][]>([]),
    [message, setMessage] = useState('Carregando grupos pessoais…');
  useEffect(() => {
    let live = true;
    void similarityService
      .groups()
      .then((r) => {
        if (live) {
          setGroups(r.groups);
          setMessage(
            r.truncated
              ? 'Lista limitada; abra uma atividade para consultar seus pares.'
              : r.groups.length
                ? ''
                : 'Nenhum grupo equivalente encontrado. Consulte trajetos semelhantes nos detalhes de uma atividade.',
          );
        }
      })
      .catch(() => {
        if (live)
          setMessage(
            'Novas correspondências dependem de conexão e análise. Histórico e Replay locais continuam disponíveis.',
          );
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="panel history-panel" aria-label="Trajetos Semelhantes">
      <h2>Trajetos Semelhantes</h2>
      <p>
        Seus grupos privados exigem equivalência entre todos os membros. Trechos
        parciais aparecem nos detalhes de cada atividade.
      </p>
      {message && <p role="status">{message}</p>}
      {groups.map((g) => (
        <div key={g[0]}>
          <h3>Trajeto semelhante · {g.length} atividades</h3>
          {g.map((id, i) => (
            <Link
              className="text-link"
              key={id}
              to={`/historico/${id}/semelhantes`}
            >
              Abrir atividade {i + 1} e correspondências{' '}
            </Link>
          ))}
        </div>
      ))}
    </section>
  );
}
