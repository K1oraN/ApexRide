import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  Compass,
  Gauge,
  History,
  LockKeyhole,
  Menu,
  Navigation,
  ShieldCheck,
  UsersRound,
  Video,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { HelmetIcon, Logo } from '../components/Brand';
import { ButtonLink } from '../components/design-system';

const features = [
  {
    icon: Gauge,
    title: 'Cada Ride, uma nova história.',
    text: 'Registre distância, duração e velocidade por GPS. Sensores opcionais acrescentam estimativas à sua atividade.',
    tag: 'RIDE & TELEMETRIA',
  },
  {
    icon: Compass,
    title: 'Encontre seu próximo caminho.',
    text: 'Explore percursos da comunidade, salve favoritos e planeje a rota da próxima saída.',
    tag: 'GPS & ROTAS',
  },
  {
    icon: HelmetIcon,
    title: 'Sua moto tem lugar aqui.',
    text: 'Organize suas motos, adicione fotos e escolha qual vai acompanhar o próximo Ride.',
    tag: 'SUA GARAGEM',
  },
  {
    icon: History,
    title: 'Reviva. Compare. Evolua.',
    text: 'Consulte seu histórico, reveja o percurso no replay e compare suas próprias atividades.',
    tag: 'HISTÓRICO & EVOLUÇÃO',
  },
  {
    icon: UsersRound,
    title: 'A estrada aproxima.',
    text: 'Compartilhe experiências, encontre grupos e participe de eventos com outros motociclistas.',
    tag: 'COMUNIDADE & EVENTOS',
  },
  {
    icon: Video,
    title: 'Guarde mais que a lembrança.',
    text: 'Em aparelhos compatíveis, grave vídeos no dispositivo e combine a imagem com os dados do Ride.',
    tag: 'VÍDEOS & SESSÕES',
  },
];
const questions = [
  [
    'O que é o Apex Ride?',
    'Uma plataforma para motociclistas reunirem suas motos, atividades por GPS, histórico, percursos e comunidade. Serve para quem quer registrar passeios e acompanhar a própria evolução.',
  ],
  [
    'Funciona com o GPS do celular?',
    'Sim. O registro usa o GPS do aparelho, com sua permissão. A precisão depende do sinal, do dispositivo e do navegador. Os dados de telemetria são estimativas.',
  ],
  [
    'Posso usar offline?',
    'Depois de entrar, uma atividade pode ser registrada e guardada no aparelho quando a conexão cair. A sincronização exige conexão e sessão válida. Mapas e recursos da comunidade dependem de internet; recarregar o app pode exigir reconectar para confirmar sua sessão.',
  ],
  [
    'Funciona no Android e no iPhone?',
    'O acesso é pelo navegador e o app pode ser instalado quando houver suporte. GPS, sensores, câmera e exportação variam por aparelho. A coleta com tela bloqueada ou app suspenso não é garantida. A validação física nos aparelhos segue pendente.',
  ],
  [
    'Minha localização fica pública?',
    'O compartilhamento de atividades depende das suas preferências e da visibilidade escolhida. Confira essas opções antes de salvar. A localização ao vivo em eventos só é ativada com consentimento temporário; o resumo público de uma atividade não inclui o traçado GPS.',
  ],
  [
    'Preciso cadastrar minha moto para criar a conta?',
    'Não. Crie sua conta com nome, usuário, e-mail e senha. Você pode organizar sua garagem depois, antes de iniciar seu primeiro Ride.',
  ],
  [
    'Os vídeos são enviados automaticamente?',
    'Não. Gravações e exportações de vídeo ficam no próprio aparelho. Guarde uma cópia dos arquivos importantes: o armazenamento do navegador pode ser liberado pelo sistema.',
  ],
  [
    'Como começo?',
    'Crie sua conta, entre no app e cadastre sua moto. Com a moto parada, prepare o Ride e autorize o GPS quando quiser iniciar. Sensores e câmera são opcionais.',
  ],
];

export function LandingPage() {
  const [menu, setMenu] = useState(false);
  const { user } = useAuth();
  return (
    <>
      <header className="public-header public-container">
        <Link to="/" aria-label="Apex Ride — Início">
          <Logo />
        </Link>
        <nav
          className={menu ? 'public-nav is-open' : 'public-nav'}
          id="menu-publico"
          aria-label="Navegação do site"
        >
          <a href="#recursos" onClick={() => setMenu(false)}>
            Recursos
          </a>
          <a href="#como-funciona" onClick={() => setMenu(false)}>
            Como funciona
          </a>
          <a href="#privacidade" onClick={() => setMenu(false)}>
            Privacidade
          </a>
          <a href="#duvidas" onClick={() => setMenu(false)}>
            Dúvidas
          </a>
        </nav>
        <div className="public-header-actions">
          <Link className="public-login" to="/entrar">
            Entrar
          </Link>
          <ButtonLink
            className="public-button primary compact"
            variant="primary"
            size="sm"
            to={user ? '/app' : '/cadastro'}
          >
            {user ? 'Abrir app' : 'Criar conta'}
            <ArrowRight size={16} />
          </ButtonLink>
          <button
            className="public-menu-toggle"
            type="button"
            aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menu}
            aria-controls="menu-publico"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <section className="landing-hero" aria-labelledby="hero-title">
        <img
          className="landing-hero-image"
          src="/assets/profile-cover.webp"
          alt="Motociclista em um mirante no litoral ao pôr do sol"
          fetchPriority="high"
          width="1280"
          height="563"
        />
        <div className="public-container landing-hero-inner">
          <div className="landing-hero-copy">
            <span className="public-eyebrow">
              <span /> A ESTRADA É SÓ O COMEÇO
            </span>
            <h1 id="hero-title">
              SUA PILOTAGEM.
              <br />
              SEUS DADOS.
              <br />
              <em>SUA EVOLUÇÃO.</em>
            </h1>
            <p>
              Viva a estrada. Registre cada Ride, descubra rotas e conecte-se
              com quem compartilha a mesma paixão.
            </p>
            <div className="public-actions">
              <ButtonLink
                className="public-button primary"
                variant="primary"
                size="lg"
                to="/cadastro"
              >
                Criar minha conta <ArrowRight size={20} />
              </ButtonLink>
              <a
                className="button button-outline button-lg public-button secondary"
                href="#recursos"
              >
                Conhecer recursos <ArrowDown size={18} />
              </a>
            </div>
            <span className="hero-note">
              Feito para motociclistas. Do primeiro passeio à próxima grande
              viagem.
            </span>
          </div>
        </div>
        <div className="hero-caption public-container">
          <span>APEX RIDE</span>
          <span>
            PILOTE MAIS LONGE <ArrowDown size={14} />
          </span>
        </div>
      </section>
      <section
        className="landing-intro public-container"
        aria-labelledby="intro-title"
      >
        <div>
          <span className="public-eyebrow">SEU MUNDO SOBRE DUAS RODAS</span>
          <h2 id="intro-title">
            Mais que rodar.
            <br />
            <em>Ter uma história para contar.</em>
          </h2>
        </div>
        <div>
          <p>
            O Apex Ride reúne sua garagem, seus percursos e suas experiências em
            um só lugar. Um espaço para quem pilota por prazer e quer conhecer
            melhor cada quilômetro.
          </p>
          <a className="public-text-link" href="#como-funciona">
            Conheça o seu próximo companheiro de estrada{' '}
            <ArrowRight size={17} />
          </a>
        </div>
      </section>
      <section
        className="landing-section public-container"
        id="recursos"
        aria-labelledby="features-title"
      >
        <div className="public-section-heading">
          <div>
            <span className="public-eyebrow">FEITO PARA A SUA JORNADA</span>
            <h2 id="features-title">
              Tudo conectado.
              <br />
              <em>Você no comando.</em>
            </h2>
          </div>
          <p>
            Da preparação ao replay.
            <br />
            Cada parte da sua experiência tem lugar aqui.
          </p>
        </div>
        <div className="public-feature-grid">
          {features.map(({ icon: Icon, title, text, tag }) => (
            <article className="public-feature" key={tag}>
              <Icon size={30} />
              <span>{tag}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section
        className="landing-steps-wrap"
        id="como-funciona"
        aria-labelledby="steps-title"
      >
        <div className="public-container landing-section">
          <span className="public-eyebrow">SIMPLES DESDE A LARGADA</span>
          <h2 id="steps-title">
            Sua próxima rota
            <br />
            <em>começa aqui.</em>
          </h2>
          <ol className="public-steps">
            {[
              [
                'Crie sua conta',
                'Seu ponto de partida. Sem precisar da moto ou do GPS no cadastro.',
              ],
              [
                'Adicione sua moto',
                'Monte sua garagem e escolha a companheira da vez.',
              ],
              [
                'Inicie um Ride',
                'Autorize o GPS e registre a atividade no seu ritmo.',
              ],
              [
                'Reveja seus dados',
                'Guarde a história, consulte o percurso e acompanhe sua evolução.',
              ],
              [
                'Encontre sua comunidade',
                'Troque experiências e descubra novos motivos para sair.',
              ],
            ].map(([title, text], i) => (
              <li key={title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section
        className="landing-benefits public-container landing-section"
        aria-labelledby="benefits-title"
      >
        <div className="benefits-photo">
          <img
            src="/assets/coastal-road.webp"
            alt="Estrada sinuosa entre o litoral e as montanhas"
            width="1536"
            height="1024"
            loading="lazy"
          />
          <span>
            <Navigation size={18} /> O próximo destino é seu.
          </span>
        </div>
        <div>
          <span className="public-eyebrow">CADA QUILÔMETRO CONTA</span>
          <h2 id="benefits-title">
            Mais presença.
            <br />
            <em>Mais perspectiva.</em>
          </h2>
          <p>
            Aproveite o caminho. Depois, encontre os detalhes que fazem cada
            saída ser única.
          </p>
          <ul className="benefit-list">
            <li>
              <Check /> Suas motos e atividades organizadas.
            </li>
            <li>
              <Check /> Sua evolução, com o seu próprio histórico.
            </li>
            <li>
              <Check /> Novos caminhos e pessoas com a mesma paixão.
            </li>
          </ul>
          <Link className="public-text-link" to="/cadastro">
            Começar minha jornada <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <section
        className="public-container"
        id="privacidade"
        aria-labelledby="privacy-title"
      >
        <div className="public-privacy">
          <div className="privacy-heading">
            <ShieldCheck size={38} />
            <span className="public-eyebrow">SUA JORNADA. SUAS ESCOLHAS.</span>
            <h2 id="privacy-title">
              Compartilhe histórias.
              <br />
              <em>Preserve seu espaço.</em>
            </h2>
            <p>
              Você escolhe como participar. Revise suas preferências de perfil e
              atividade no app.
            </p>
          </div>
          <div className="privacy-items">
            <article>
              <LockKeyhole />
              <div>
                <h3>Controle de visibilidade</h3>
                <p>
                  Escolha o que fica público ou privado. Compartilhar uma
                  atividade é opcional.
                </p>
              </div>
            </article>
            <article>
              <Navigation />
              <div>
                <h3>Localização com permissão</h3>
                <p>
                  O GPS é solicitado ao preparar o Ride. A localização em
                  eventos exige consentimento temporário.
                </p>
              </div>
            </article>
            <article>
              <Video />
              <div>
                <h3>Vídeos no seu aparelho</h3>
                <p>
                  Gravações locais, sem envio automático. Seu acesso pessoal é
                  protegido por uma conta autenticada.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section
        className="landing-section public-container public-faq"
        id="duvidas"
        aria-labelledby="faq-title"
      >
        <div>
          <span className="public-eyebrow">ANTES DE COLOCAR O CAPACETE</span>
          <h2 id="faq-title">
            Ficou com
            <br />
            <em>alguma dúvida?</em>
          </h2>
        </div>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={19} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="public-final-cta public-container">
        <span className="public-eyebrow">A PRÓXIMA HISTÓRIA É SUA</span>
        <h2>
          O CAMINHO CHAMA.
          <br />
          <em>VAMOS MAIS LONGE?</em>
        </h2>
        <p>Crie sua conta e dê o primeiro passo para o próximo Ride.</p>
        <ButtonLink
          className="public-button primary"
          variant="primary"
          size="lg"
          to="/cadastro"
        >
          Fazer parte do Apex Ride <ArrowRight size={20} />
        </ButtonLink>
        <Link className="public-text-link" to="/entrar">
          Já tenho conta. Entrar <ArrowRight size={16} />
        </Link>
      </section>
      <footer className="public-footer public-container">
        <div>
          <Link to="/" aria-label="Apex Ride — site">
            <Logo />
          </Link>
          <p>Sua pilotagem. Seus dados. Sua evolução.</p>
        </div>
        <nav aria-label="Links úteis">
          <a href="#recursos">Recursos</a>
          <a href="#duvidas">Dúvidas</a>
          <Link to="/documentos">Termos e privacidade</Link>
          <Link to="/entrar">Entrar</Link>
          <Link to="/cadastro">Criar conta</Link>
        </nav>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Apex Ride</span>
          <span>Pré-lançamento · homologação pendente</span>
        </div>
      </footer>
    </>
  );
}
