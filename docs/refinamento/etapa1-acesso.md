# Apex Ride — Etapa 1: entrada pública e acesso autenticado

Data: 23/10/2026. Implementação local sobre a base existente. Sem deploy,
alteração de VPS, banco produtivo ou início da Etapa 2.

## A. Diagnóstico inicial

A raiz abria a Home interna. Explorar, Ride, Comunidade, grupos e Garagem tinham
entradas públicas; apenas parte das páginas pessoais usava `RequireAuth`.
Login e cadastro já eram rotas diferentes, porém compartilhavam cabeçalho e
navegação de condução. O retorno de login aceitava poucos destinos e perdia
contexto ao trocar para cadastro. O backend aceitava somente e-mail no login.

As contas, cookies HttpOnly, CSRF, recuperação por token, PostgreSQL, Garagem,
Ride, checkpoints, vídeos e administração com RBAC/MFA já existiam. Foram
preservados. A auditoria da Parte 0 e a Parte 23 são evidências anteriores;
os resultados desta entrega estão discriminados abaixo.

## B. Implementação

- Landing pública com header responsivo, hero, apresentação, seis recursos,
  cinco passos, benefícios, privacidade, FAQ, CTA e rodapé. Textos descrevem
  capacidades existentes e os limites reais de GPS, offline, câmera e navegador.
- Identidade em preto/grafite/vermelho, títulos esportivos, fotos costeiras do
  próprio projeto, campos e botões coerentes com as referências anexadas.
  Não foram adicionados mapas ou valores de telemetria demonstrativos à landing.
- Login e cadastro em telas próprias, fora das cinco abas do app. Cadastro
  solicita nome completo, username, e-mail, senha, confirmação e aceite vigente;
  não solicita moto, localização, cidade ou estado. Cidade/UF continuam editáveis
  no perfil e aceitas pelo backend para compatibilidade.
- Login real por e-mail **ou username**, com o campo HTTP `email` preservado para
  clientes existentes, normalização e consulta parametrizada. Senhas mantêm a
  política de 15–128 caracteres; login não altera senhas existentes.
- Carregamento, erros, exibição de senha e trava síncrona contra envio duplicado.
  Cadastro bem-sucedido orienta a entrar, respeitando a confirmação de e-mail
  configurada no servidor; não cria sessão fictícia.
- `RequireAuth` antecede o layout interno. Não há painel ou abas durante a
  restauração, redirecionamento ou falha de conexão. O retorno preserva caminho,
  query e fragmento, inclusive entre login e cadastro, com lista de contextos
  internos permitidos e rejeição de URLs externas/ambíguas.
- Recuperação, redefinição e confirmação continuam usando endpoints e tokens
  reais, com fragmento removido do histórico e expiração/uso único no servidor.
  `/auth/config` informa `passwordRecoveryAvailable`: sem SMTP habilitado, a tela
  explica a indisponibilidade e não permite simular envio pelo provedor de teste.
  E-mail e username compartilham o mesmo limite de tentativas da conta.
- Logout, revogação e comunicação entre abas preservados. Respostas antigas de
  restauração não podem reabrir uma identidade encerrada. O PWA abre `/app` e
  mantém scope `/`; o mesmo bloqueio vale para acesso instalado ou direto.

## C. Contrato de rotas

| Contexto                    | Rotas principais                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Público                     | `/`, `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`, `/verificar-email`, `/documentos` |
| Resumo público autorizado   | `/compartilhar/rides/:id`, sem traçado GPS; autorização existente preservada                           |
| Início autenticado          | `/app`                                                                                                 |
| Abas autenticadas           | `/explorar`, `/ride`, `/comunidade`, `/garagem` e suas páginas filhas                                  |
| Demais páginas autenticadas | `/perfil/*`, `/configuracoes`, `/privacidade`, `/historico/*`, `/estatisticas`, `/tecnico`             |
| Administração separada      | `/admin/:section?`, com sessão, autorização por operação e MFA existentes                              |

A raiz apresenta a landing inclusive para quem já entrou; nesse caso o header
oferece “Abrir app”. Entrar/cadastrar estando autenticado leva ao retorno
permitido ou a `/app`. As URLs internas existentes foram preservadas para não
quebrar links de rota, moto, convite, evento, histórico e replay. Não houve
migração de todas as URLs para `/app/*`; `/app` é o novo início do painel.
Páginas inexistentes mostram uma tela pública de 404, sem painel.

As APIs privadas continuam conferindo cookie, expiração, propriedade, CSRF e
permissões no servidor. Endpoints de leitura que já tinham contrato público
(como resumo consentido e percursos públicos) não foram tornados privados por
mera alteração da navegação web.

## Sessão, indisponibilidade e registros locais

Um perfil em IndexedDB não prova que o cookie continua válido. Após recarga,
o frontend exige confirmação por `/api/auth/me`. Erro de rede/5xx mostra nova
tentativa e **não** promove o perfil salvo a usuário autenticado nem apaga seus
registros. Um 401 retira a identidade corrente; atividades, motos em cache e
vídeos não são removidos por essa ação.

Durante uma sessão já validada e ainda aberta, a queda de internet preserva o
Ride e a gravação local existentes. Após **recarregar offline**, é necessário
reconectar e confirmar a sessão para reabrir a interface privada. Essa mudança
intencional de acesso está coberta pelo cenário de recuperação offline adaptado;
não é prometida autenticação offline a partir de um perfil em cache.

## D. Arquivos principais

- `apps/web/src/pages/LandingPage.tsx`, `components/PublicLayout.tsx` e
  `styles/public.css`: experiência pública e identidade das telas de conta.
- `apps/web/src/App.tsx`, `components/Layout.tsx`, `auth/RequireAuth.tsx` e
  `public/manifest.webmanifest`: separação dos contextos, entrada e navegação.
- `apps/web/src/pages/AuthPage.tsx`, `components/AccountFields.tsx`,
  `services/auth.ts` e `auth/returnTo.ts`: formulários, ícones, envio,
  disponibilidade da recuperação e retorno seguro.
- `apps/web/src/auth/AuthProvider.tsx`: restauração e invalidação de sessão.
- `apps/api/src/modules/auth/routes.ts`: autenticação por e-mail ou usuário.
- Testes de retorno, sessão, envio duplicado, PostgreSQL e E2E de entrada;
  adaptação dos cenários existentes que antes pressupunham acesso anônimo ao app.
- README, manual de autenticação/offline e progresso: contrato atualizado.

## E. Validação

Windows, Node 24.16.0, pnpm 10.34.7, Chrome e PostgreSQL/PostGIS locais. Nesta
sessão, `.local/toolbin` foi acrescentado somente ao PATH do processo para usar
o pnpm já disponível; nenhuma configuração global foi modificada. Os runners
de PostgreSQL e navegador criam e removem esquemas exclusivos de teste. As
rodadas de banco e navegador foram executadas sequencialmente.

| Comando                                                                                                            | Resultado                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                       | Tipos, lint sem avisos, formatação, **704 testes padrão aprovados (260 API + 444 web)** e builds aprovados. Os 367 testes PostgreSQL ignorados nessa suíte não contam como aprovados. |
| `pnpm test:postgres test/auth.postgres.test.ts test/admin.postgres.test.ts`                                        | **74 aprovados**, antes dos dois cenários novos de alias/limite.                                                                                                                      |
| `pnpm test:postgres test/auth.postgres.test.ts -t 'normalizado\|compartilham'`                                     | **2 aprovados**: e-mail/username reais e limite compartilhado. Total de **76 cenários PostgreSQL distintos avaliados nesta entrega**, sem repetir a suíte completa de outros módulos. |
| `pnpm --filter @apex-ride/web test:e2e`                                                                            | Rodada ampla: **85 aprovados e 4 falhas em 89 cenários**; fechamento e repetições descritos abaixo.                                                                                   |
| `pnpm --filter @apex-ride/web test:e2e entry.spec.ts auth.spec.ts interface.spec.ts qa.spec.ts`                    | **29 aprovados** no build final, incluindo teclado, API real, privacidade de acesso, sessão, retorno, cadastro, credenciais, logout, recuperação indisponível e cinco abas internas.  |
| `pnpm --filter @apex-ride/web build` e `pnpm --filter @apex-ride/web test:e2e entry.spec.ts --grep 'sem overflow'` | Build aprovado após ajuste final do header em 320 px; **4 cenários visuais aprovados**, com landing, login e cadastro em 320/390/768/1440 px.                                         |

Fechamento de mídia: `pnpm --filter @apex-ride/web test:e2e video-overlay.spec.ts video.spec.ts --workers=1`
teve **5 aprovados** no build final, incluindo WebM/MP4, frames compostos,
áudio opcional, gravação, permissões e persistência local.

A rodada ampla precedeu os últimos ajustes de estilo público e disponibilidade
de recuperação; esses pontos foram reavaliados nas rodadas finais acima.
O teste de teclado inicialmente pressionava Tab antes da restauração de sessão
e foi corrigido para aguardar a navegação autenticada. A primeira adaptação da
suíte de interface também revelou duas expectativas antigas (Home em `/` e
vídeo desabilitado para visitante); foram atualizadas ao contrato autenticado,
e os 12 cenários de interface passaram nas repetições.

No cenário de vídeo, reconectar e recarregar imediatamente podia interromper um
upload e deixar o lease protetivo de 60 segundos ativo, excedendo a espera antiga
de 15 segundos. O teste agora exige o recibo “Sincronizado” antes de recarregar
para examinar a persistência do vídeo. Os dois cenários de exportação falharam
por timeout na rodada concorrente e passaram em repetição com um worker. Isso
não demonstra estabilidade da exportação sob concorrência; a homologação de
hardware continua pendente. Nenhum código de gravação/exportação foi alterado.
Consolidação: **89 cenários distintos de Chrome aprovados entre a rodada ampla
e as repetições**, sem somar cenários repetidos nem declarar a rodada ampla
inteira verde. Não foi reexecutada toda a suíte PostgreSQL de 367 cenários.

As capturas ficam em `.local/screenshots/refinamento1/`: páginas completas e
primeira dobra da landing. Foram inspecionadas a landing desktop/mobile e telas
de conta, com correção da quebra do CTA no header de 320 px e isolamento das
classes do hero público para preservar o hero interno. Logs locais:
`.local/refinamento1-check-final.log`, `refinamento1-postgres.log`,
`refinamento1-auth-alias-final.log`, `refinamento1-browser-all.log`,
`refinamento1-browser-final.log`, `refinamento1-visual-closure.log` e
`refinamento1-video-closure.log`.
O build mantém o aviso de chunks acima de 500 kB; não representa falha de build
nem comprova desempenho em celulares. GPS/mapas/câmera controlados nos cenários
de navegador não equivalem a homologação física.

## F. Pendências e preparação operacional

- SMTP externo, remetente e entrega na origem definitiva precisam de validação.
  O backend já possui envio SMTP real e recusa o provedor de teste em produção;
  `MAIL_MODE=test` não envia e-mail externo. Não foi configurada infraestrutura.
- Termos de Uso/Política de Privacidade definitivos e canal de suporte dependem
  do responsável. O aviso preliminar existente permanece explícito; não foram
  inventados documentos ou contatos. Produção continua recusando versões preliminares.
- Homologação Android/iPhone, armazenamento, permissões/hardware e operação
  produtiva permanecem pendentes, conforme Parte 23. A Etapa 1 não libera produção.

Frontend e API continuam em artefatos separados (`apps/web/dist` e
`apps/api/dist`), com `PORT`, `HOST`, origem web, CORS e conexão de banco
configuráveis. Para a futura VPS compartilhada, reservar origem/subdomínio
próprio, serviço/processo e diretório próprios, porta interna disponível após
inventário, banco/usuário exclusivos e volume privado de mídia. O proxy deve
encaminhar `/api` antes do fallback da SPA e usar HTTPS; `/admin` exige os headers
previstos no runbook. Não compartilhar cookies, banco ou segredos com o outro app.
Os caminhos web absolutos atuais pressupõem implantação na raiz da origem;
subdiretório exige adaptação posterior, não é suporte anunciado nesta entrega.
Nenhuma porta, serviço ou configuração do host remoto foi alterada.

## G. Preparação para a Etapa 2

Entrada pública, telas de conta e limite de acesso estão separados do aplicativo.
O design system interno e as cinco abas permanecem disponíveis para refinamento
incremental posterior. Catálogo, fichas técnicas, novos rankings, missões, chats,
equipes e redesign do Ride não foram implementados nesta etapa.
