import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { Button } from '../components/design-system';
import { formatDuration } from '../ride/format';
import '../styles/video.css';
import { useRideVideo } from './context';
import { VideoOverlayEntry } from './overlay/VideoOverlayPlayer';
import { videoRepository } from './repository';
import type { VideoSegment } from './types';

function SegmentPlayer({
  owner,
  segment,
}: {
  owner: string;
  segment: VideoSegment;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      objectUrl = '';
    void videoRepository
      .blob(owner, segment.id)
      .then((blob) => {
        if (active) {
          if (!document.createElement('video').canPlayType(segment.mimeType))
            throw new Error(
              'Este navegador não informa suporte de reprodução para este formato.',
            );
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [owner, segment.id, segment.mimeType]);
  const extension =
    segment.mimeType.split(';')[0] === 'video/mp4' ? 'mp4' : 'webm';
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {url && (
        <>
          <video
            controls
            playsInline
            preload="metadata"
            src={url}
            aria-label={`Vídeo local ${segment.order + 1}`}
            onError={() =>
              setError(
                'Não foi possível reproduzir este arquivo. Ele pode estar incompleto ou usar um codec incompatível.',
              )
            }
            onLoadedMetadata={(e) => {
              void videoRepository
                .mediaDuration(
                  owner,
                  segment.id,
                  e.currentTarget.duration * 1000,
                )
                .catch(() => {});
            }}
          />
          <a
            className="text-link"
            href={url}
            download={`apex-ride-${segment.clientId}-${segment.order + 1}.${extension}`}
          >
            Salvar cópia deste segmento (.{extension})
          </a>
          <p>
            A cópia usa o arquivo original. No celular, o navegador pode abrir o
            arquivo ou oferecer Salvar/Compartilhar nos controles nativos.
          </p>
        </>
      )}
      {!url && !error && <p role="status">Abrindo arquivo local…</p>}
    </div>
  );
}
export function VideoLibrary({
  clientId,
  serverId,
  historicalBike,
  studio = false,
}: {
  clientId: string;
  serverId?: string | undefined;
  historicalBike?: string;
  studio?: boolean;
}) {
  const { user } = useAuth(),
    { video: integration, snapshot: video } = useRideVideo();
  const [data, setData] = useState<{
      owner: string;
      client: string;
      rows: VideoSegment[];
    } | null>(null),
    [message, setMessage] = useState(''),
    [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState('');
  const [overlay, setOverlay] = useState('');
  const initializedStudio = useRef(false);
  useEffect(() => {
    let live = true;
    if (user) {
      const owner = user.id;
      void (async () => {
        await videoRepository.recover(owner, Date.now(), true);
        if (serverId) await videoRepository.link(owner, clientId, serverId);
        const rows = await videoRepository.list(owner, clientId);
        if (live) {
          setData({
            owner,
            client: clientId,
            rows: rows.sort((a, b) => a.order - b.order),
          });
          if (studio && !initializedStudio.current) {
            const first = rows.find(
              (row) => row.state !== 'writing' && row.chunks > 0,
            );
            if (first) {
              initializedStudio.current = true;
              setOverlay(first.id);
            }
          }
        }
      })().catch((e) => {
        if (live) setMessage(e.message);
      });
    }
    return () => {
      live = false;
    };
  }, [user, clientId, serverId, refresh, video.segments, studio]);
  if (!user) return null;
  const rows =
    data?.owner === user.id && data.client === clientId ? data.rows : [];
  async function remove() {
    if (
      !user ||
      !window.confirm(
        'Excluir somente os vídeos locais desta atividade? A telemetria será preservada. Esta ação não pode ser desfeita.',
      )
    )
      return;
    try {
      setSelected('');
      setOverlay('');
      await integration.controller.video?.discard(user.id, clientId);
      setRefresh((n) => n + 1);
      setMessage('Vídeos locais excluídos.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <section
      className="panel video-library"
      aria-label="Vídeos desta atividade"
    >
      <h2>
        {studio
          ? 'Estúdio · segmentos desta atividade'
          : 'Vídeos desta atividade'}
      </h2>
      <p>Somente neste dispositivo e nesta conta · sem cópia na nuvem.</p>
      {rows.length === 0 ? (
        <p>
          Gravação não disponível neste dispositivo. Atividades sem vídeo
          continuam com telemetria e Replay próprios.
        </p>
      ) : (
        <>
          <p>
            {rows.length} segmento(s) · ~
            {formatDuration(
              rows.reduce(
                (n, r) => n + (r.mediaDurationMs ?? r.durationEstimatedMs ?? 0),
                0,
              ),
            )}{' '}
            (durações desconhecidas não somadas) ·{' '}
            {(rows.reduce((n, r) => n + r.bytes, 0) / 1024 / 1024).toFixed(1)}{' '}
            MB confirmados
          </p>
          {rows.map((row, index) => (
            <article key={row.id}>
              <h3>
                Segmento {row.order + 1} ·{' '}
                {row.state === 'complete'
                  ? 'Finalizado'
                  : row.state === 'writing'
                    ? 'Aguardando encerramento confirmado'
                    : 'Incompleto / interrompido'}
              </h3>
              <p>
                {row.applied.facingMode === 'user'
                  ? 'Frontal'
                  : row.applied.facingMode === 'environment'
                    ? 'Traseira'
                    : 'Câmera sem orientação informada'}{' '}
                · {row.applied.width ?? '—'} × {row.applied.height ?? '—'} ·{' '}
                {row.mimeType || 'formato não confirmado'} ·{' '}
                {(row.bytes / 1024 / 1024).toFixed(1)} MB ·{' '}
                {row.audio ? 'Com áudio' : 'Sem áudio'}
              </p>
              <p>
                {row.start
                  ? `Início no Ride: ${(row.start.rideElapsedMs / 1000).toFixed(1)} s; tempo ativo: ${(row.start.rideActiveMs / 1000).toFixed(1)} s.`
                  : 'Início da captura não confirmado.'}{' '}
                {row.end
                  ? `Fim no Ride: ${(row.end.rideElapsedMs / 1000).toFixed(1)} s.`
                  : 'Fim não confirmado.'}{' '}
                {row.durationEstimatedMs === null
                  ? 'Duração desconhecida.'
                  : `Duração aproximada: ${(row.durationEstimatedMs / 1000).toFixed(1)} s.`}
              </p>
              {index > 0 && rows[index - 1]!.end && row.start && (
                <p>
                  Intervalo sem filmagem entre segmentos: ~
                  {(
                    Math.max(
                      0,
                      row.start.rideElapsedMs -
                        rows[index - 1]!.end!.rideElapsedMs,
                    ) / 1000
                  ).toFixed(1)}{' '}
                  s. Motivo anterior: {rows[index - 1]!.reason}
                </p>
              )}
              <p>{row.reason}</p>
              {row.state === 'complete' && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOverlay('');
                    setSelected(selected === row.id ? '' : row.id);
                  }}
                >
                  {selected === row.id
                    ? 'Fechar vídeo'
                    : `Assistir vídeo ${row.order + 1}`}
                </Button>
              )}
              {selected === row.id && (
                <SegmentPlayer
                  key={`${user.id}:${row.id}`}
                  owner={user.id}
                  segment={row}
                />
              )}
              {row.state !== 'writing' && row.chunks > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelected('');
                    setOverlay(overlay === row.id ? '' : row.id);
                  }}
                >
                  {overlay === row.id
                    ? 'Fechar telemetria do vídeo'
                    : row.state === 'incomplete'
                      ? 'Tentar trecho recuperável com telemetria'
                      : `Assistir com telemetria · ${row.order + 1}`}
                </Button>
              )}
              {overlay === row.id && (
                <VideoOverlayEntry
                  key={`${user.id}:${row.id}`}
                  owner={user.id}
                  segment={row}
                  serverId={serverId}
                  historicalBike={historicalBike}
                />
              )}
            </article>
          ))}
          <button className="text-link" onClick={() => void remove()}>
            Excluir vídeos locais desta atividade
          </button>
        </>
      )}
      <button className="text-link" onClick={() => setRefresh((n) => n + 1)}>
        Verificar arquivos locais
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function VideoRecovery() {
  const { user } = useAuth();
  const [data, setData] = useState<{ owner: string; clients: string[] } | null>(
      null,
    ),
    [open, setOpen] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    if (user)
      void videoRepository
        .recover(user.id)
        .then(() => videoRepository.list(user.id))
        .then((rows) => {
          if (live)
            setData({
              owner: user.id,
              clients: [...new Set(rows.map((r) => r.clientId))],
            });
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [user]);
  if (!user || data?.owner !== user.id || (!data.clients.length && !error))
    return null;
  return (
    <section className="panel video-library">
      <h2>Vídeos neste aparelho</h2>
      <p>
        Arquivos persistidos, inclusive gravações cuja atividade ainda precisa
        ser recuperada. Se a atividade não existir mais, os arquivos permanecem
        aqui até sua decisão de exclusão.
      </p>
      {data.clients.map((id, i) => (
        <div key={id}>
          <button
            className="text-link"
            onClick={() => setOpen(open === id ? '' : id)}
          >
            Gravação local {i + 1} · {id.slice(0, 8)}
          </button>
          {open === id && <VideoLibrary clientId={id} />}
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
