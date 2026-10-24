import {
  BookOpen,
  Camera,
  Compass,
  Gauge,
  HardDrive,
  Route,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { ButtonLink, SearchInput } from '../components/design-system';
import '../styles/guide.css';

const topics = [
  {
    id: 'ride',
    title: 'Começar e controlar um Ride',
    icon: Gauge,
    text: [
      'Escolha sua moto e o modo Passeio, Pista ou Misto. Livre, Com rota e Com evento são contextos independentes do modo. Vídeo e sensores são opcionais: você pode iniciar apenas com GPS.',
      'Iniciar Ride aguarda uma posição utilizável. Pausar congela o tempo ativo; Continuar aguarda GPS novamente. Finalizar abre o resumo para salvar ou descartar com confirmação.',
      'O GPS só é solicitado por sua ação. Localização e atividade são gravadas no aparelho; o envio aguarda sua confirmação no resumo. A sessão é preservada ao navegar no Apex Ride. O provedor do mapa recebe a região visualizada.',
      'Força G estimada quando calibrada; inclinação dinâmica indisponível. O GPS pode ser interrompido com a tela bloqueada ou em segundo plano; trechos ausentes não serão reconstruídos. Configure somente com a moto parada.',
    ],
    to: '/ride',
    action: 'Preparar Ride',
  },
  {
    id: 'sensores',
    title: 'GPS, sensores e calibração',
    icon: Compass,
    text: [
      'GPS Puro apresenta a leitura direta. GPS Assistido Automático usa uma estimativa somente quando GPS, sensores e calibração forem suficientes; caso contrário, volta ao GPS Puro. A preferência pode ser alterada antes de iniciar ou durante pausa.',
      'Funcionamento exige três leituras utilizáveis, distintas e recentes. A presença da API não confirma um sensor. G também exige aceleração linear, montagem e calibração válidas. Um valor ausente aparece como travessão, não como zero.',
      'Fixe o celular em suporte estável, sem folgas, com a tela voltada para cima (até 45° da horizontal). Não use na mão. Calibre somente com a moto parada e vertical. Não altere a montagem após calibrar.',
      'Estabilidade dos sensores não comprova que a moto está vertical. Sua confirmação define essa referência. A força G é uma estimativa limitada; a inclinação dinâmica está indisponível até validação física. Após perder calibração, inicie outra preparação para recalibrar.',
    ],
    to: '/ride',
    action: 'Abrir preparação',
  },
  {
    id: 'navegacao',
    title: 'Planejar rotas e navegação',
    icon: Route,
    text: [
      'Planeje com a moto parada. Navegar não inicia gravação, XP ou compartilhamento. Para registrar uma sessão, inicie o Ride separadamente.',
      'Toque no mapa para adicionar pontos. O primeiro é a origem, o último é o destino. Entre eles você pode adicionar paradas. Coordenadas são uma alternativa quando a busca de endereços estiver indisponível.',
      'A busca de endereços depende de provedor autorizado configurado. O itinerário é calculado pelas vias entre as paradas e pode diferir do traçado salvo ou importado.',
      'Tempo aproximado, sem trânsito ao vivo. O perfil do roteador pode não contemplar restrições específicas de motocicletas. Confira a sinalização. Mapas e recálculo precisam de conexão; a PWA não garante execução com tela bloqueada.',
      'Circuitos e voltas exigem modo Pista, circuito verificado, geometria, linha de largada e sentido válidos. A primeira passagem abre uma volta estimada; pausas e perda de qualidade interrompem a observação. Não é cronometragem oficial.',
    ],
    to: '/explorar/navegar',
    action: 'Planejar navegação',
  },
  {
    id: 'video',
    title: 'Câmera e gravação local',
    icon: Camera,
    text: [
      'Configure ou troque a câmera com a moto parada, antes de iniciar ou durante uma pausa. A prévia não grava. O Ride inicia o vídeo quando a câmera estiver pronta e o início for confirmado.',
      'Frontal e traseira são alternativas: apenas uma câmera por vez. O áudio começa desligado; ativá-lo solicita microfone e pode registrar conversas e sons de terceiros.',
      'Pausas geram arquivos separados. REC aparece após confirmação real de início. Falhas da câmera não encerram GPS; encerrar câmera preserva o Ride e os segmentos anteriores.',
      'Somente neste aparelho, sem upload. Filmagens podem envolver a privacidade de terceiros. Vídeo, GPS e sensores consomem bateria e podem aquecer o aparelho. Bloqueio de tela ou troca de aplicativo podem interromper a captura; retome explicitamente durante uma pausa.',
    ],
    to: '/ride/videos',
    action: 'Abrir vídeos',
  },
  {
    id: 'estudio',
    title: 'Estúdio, sincronização e exportação',
    icon: Camera,
    text: [
      'Vídeos não são enviados à nuvem. O estúdio preserva o original e usa as âncoras registradas, com ajuste manual de tempo. Sem telemetria da mesma sessão, a composição fica indisponível.',
      'Escolha um segmento, layout, indicadores e posição. Ajuste o offset em passos de 0,1 s: positivo consulta telemetria posterior; negativo consulta anterior. O ajuste não reescreve as medições nem as referências originais.',
      'Importação externa ainda indisponível: o protocolo atual exige âncoras da captura do Ride. Não há associação automática por nome ou data de arquivo.',
      'A exportação composta exige página ativa e codec suportado. Falta de espaço ou suspensão pode interrompê-la; o original permanece acessível. WebM/MP4 e áudio dependem do suporte efetivo do navegador. A cópia original não recebe overlay.',
    ],
    to: '/ride/estudio',
    action: 'Abrir estúdio',
  },
  {
    id: 'offline',
    title: 'Offline, armazenamento e recuperação',
    icon: HardDrive,
    text: [
      'Salvo no aparelho e Sincronizado são confirmações diferentes. O envio ocorre somente após salvar e confirmar sua conta no servidor. A cópia deste aparelho não é um login offline.',
      'A recuperação inclui somente gravações locais confirmadas; amostras ainda em memória podem ser perdidas. Não é reconstruído o período com o navegador fechado. Uma sessão interrompida deve ser revisada, não retomada automaticamente.',
      'O armazenamento do navegador está sujeito a quota, limpeza e evicção. Solicitar persistência reduz o risco de remoção automática, mas não cria backup. Vídeos continuam somente neste aparelho.',
      'Cópias locais já sincronizadas são reconciliadas pelo identificador da sessão. A prévia local é separada do total remoto. Excluir exige confirmação e não remove dados de outras atividades.',
    ],
    to: '/ride/sessoes',
    action: 'Ver sessões',
  },
  {
    id: 'privacidade',
    title: 'Sessões, trajetos e privacidade',
    icon: ShieldCheck,
    text: [
      'Iniciar Ride não publica localização ou vídeo e não inicia compartilhamento social. Sessões, telemetria detalhada e vídeos locais respeitam a conta proprietária.',
      'Seus grupos privados de trajetos semelhantes exigem equivalência entre todos os membros. Trechos parciais aparecem nos detalhes de cada atividade.',
      'Descobertas regionais mostram agregados de atividades com autorização específica. Trajetos detectados não criam rotas cadastradas. Não são publicados mapas, identidades, horários ou telemetria individual.',
    ],
    to: '/ride/sessoes',
    action: 'Abrir minhas sessões',
  },
  {
    id: 'comunidade',
    title: 'Comunidade e descobertas',
    icon: UsersRound,
    text: [
      'Novas histórias, novas conexões.',
      'Abra a Comunidade para encontrar publicações, grupos e eventos. Compartilhamento de localização exige uma autorização separada.',
    ],
    to: '/comunidade',
    action: 'Explorar comunidade',
  },
];
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function GuidePage() {
  const [query, setQuery] = useState('');
  const { hash } = useLocation();
  const selected = hash.slice(1);
  useEffect(() => {
    if (!selected) return;
    const frame = requestAnimationFrame(() =>
      document
        .getElementById(selected)
        ?.scrollIntoView({ behavior: 'instant', block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [selected]);
  const visible = topics.filter(
    (topic) =>
      topic.id === selected ||
      normalize([topic.title, ...topic.text].join(' ')).includes(
        normalize(query),
      ),
  );
  return (
    <div className="guide-page">
      <header className="guide-heading">
        <BookOpen size={34} aria-hidden />
        <div>
          <span className="eyebrow">CONHEÇA SEU APEX</span>
          <h1>
            GUIA DO <em>PILOTO</em>
          </h1>
          <p>Respostas e instruções em um só lugar.</p>
        </div>
      </header>
      <SearchInput
        label="Pesquisar no Guia"
        placeholder="Buscar GPS, câmera, sessões…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="guide-topics">
        {visible.map((topic) => (
          <details
            className="panel guide-topic"
            id={topic.id}
            key={topic.id}
            open={query || selected === topic.id ? true : undefined}
          >
            <summary>
              <topic.icon size={24} aria-hidden />
              <span>{topic.title}</span>
            </summary>
            <div>
              {topic.text.map((text) => (
                <p key={text}>{text}</p>
              ))}
              <ButtonLink variant="secondary" to={topic.to}>
                {topic.action}
              </ButtonLink>
            </div>
          </details>
        ))}
      </div>
      {!visible.length && (
        <section className="panel empty-state">
          <p>Nenhum tópico encontrado. Tente outra palavra.</p>
        </section>
      )}
    </div>
  );
}
