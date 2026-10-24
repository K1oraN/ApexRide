# Etapa 1 — Parte 02 de 23

Data: 22/10/2026. Escopo: interface React, identidade Racing Tech e navegação.
Referências: `01_inicio.png`, `02_explorar.png`, `03_modo_misto.png` e
`04_perfil_comunidade.png`, fornecidas pelo usuário. Não houve deploy nem avanço
para autenticação, garagem funcional, telemetria, GPS, sensores ou câmera.

## Arquivos e componentes

Alterados: `apps/web/src/App.tsx`, `main.tsx`, `styles/global.css`,
`pages/HealthPage.tsx`, `index.html`, `package.json`, `tsconfig.json`,
`vitest.config.ts`, `vite.config.ts` e o lockfile do workspace. Documentação atualizada no README
e com referência de evolução em `architecture.md`; o registro da Parte 01 foi
preservado.

Criados no frontend:

- `components/Layout.tsx`: cabeçalho, localização ilustrativa, notificações,
  avatar, aviso de demonstração, área principal e navegação inferior.
- `components/Brand.tsx`: logo recomposta em SVG/texto, motocicleta, capacete,
  estrada sinuosa, bandeira quadriculada e ícones dos modos.
- `components/ui.tsx`: Avatar, SectionTitle, Progress, Chip, Photo,
  UnavailableButton e Popover com fechamento externo/Escape.
- `components/telemetry/`: Speedometer em SVG e componentes MetricCard/RideSummary.
- `components/maps/IllustrativeMap.tsx`: terreno estático, linhas SVG, pontos e
  rótulos HTML, zoom local e seleção visual Satélite/Relevo. Isolado da página
  para futura substituição por um provedor de mapas.
- `components/routes/RouteCard.tsx`: cartões em destaque, normais e compactos,
  categorias, métricas e favorito somente em memória.
- `components/social/Social.tsx`: prévias sociais, medalhas, publicação,
  comentários, comunidades e ranking ilustrativos.
- `pages/HomePage.tsx`, `ExplorePage.tsx`, `RidePage.tsx`, `CommunityPage.tsx`,
  `GaragePage.tsx`: as telas e a página provisória da Garagem.
- `data/demo.ts`: perfil, modos, telemetria, trajetos, moto, publicações, grupos,
  conquistas e ranking locais. Nenhuma resposta falsa substitui a API técnica.
- `styles/tokens.css`, `public/assets/*.webp`, `public/favicon.svg`,
  `scripts/build.mjs`, `playwright.config.ts` e `e2e/interface.spec.ts`.

## Rotas

| Caminho                              | Conteúdo                                                   |
| ------------------------------------ | ---------------------------------------------------------- |
| `/`                                  | Início                                                     |
| `/explorar`                          | Busca, filtros, mapa e cartões demonstrativos              |
| `/explorar?rota=litoral-norte`       | Detalhe ilustrativo do circuito selecionado                |
| `/ride`                              | Modo Misto, padrão                                         |
| `/ride?modo=passeio` / `?modo=pista` | Seleção visual com o mesmo painel reutilizado              |
| `/comunidade` / `/perfil`            | Perfil e organização social aprovados                      |
| `/garagem`                           | Página provisória; gerenciamento reservado para a Parte 04 |
| `/tecnico`                           | Página técnica da Parte 01 e comunicação real com a API    |
| Demais caminhos                      | Página não encontrada com retorno ao Início                |

React Router usa History API, links e estado selecionado na navegação inferior,
sem recarregar o documento. O avatar abre `/perfil`. Mudanças de página retornam
ao topo e focam a área principal. Páginas secundárias usam `React.lazy` e Suspense.
A infraestrutura futura precisará servir `index.html` para rotas do SPA; não foi
configurado servidor de produção nesta etapa.

## Estilos e recursos

Tokens extraídos visualmente dos mockups: fundo `#080b0d`, painel `#101519`,
borda `#283036`, vermelho `#ff202d`, texto `#f7f8f8` e secundário `#aeb7c3`.
Os cartões usam gradientes grafite discretos, bordas finas, cantos arredondados
e brilho vermelho nas ações centrais. Não há moldura de telefone, relógio,
ilha dinâmica, bateria ou barra fictícia do sistema operacional.

`Roboto Condensed` é hospedada localmente, com pesos 400/500/600/700 e itálico 700. Títulos esportivos usam a composição em negrito/itálico. A fonte exata do
mockup não foi fornecida. Licença OFL copiada em `licenses/RobotoCondensed-OFL.txt`.

Os oito assets em `apps/web/public/assets/` foram gerados com a ferramenta
integrada `imagegen`, usando os mockups como referência de composição. Os
prompts finais e nomes dos arquivos estão em [visual-assets.json](visual-assets.json).
Otimização local para WebP, sem recortes de interfaces e sem imagens remotas.
São fotografias/terreno ilustrativos temporários; não são fotografias oficiais
isoladas nem dados cartográficos reais. Os mockups completos não estão no bundle.

Grades reduzem colunas nas larguras menores para preservar leitura. A navegação
usa áreas seguras e há espaço inferior para que o fim do conteúdo não fique
sob a barra fixa. Controles usam foco visível, nomes acessíveis, botões nativos,
seletores rotulados e estados anunciados. O CSS respeita redução de movimento.

## Dependências novas

| Dependência                        | Versão | Necessidade / licença                              |
| ---------------------------------- | ------ | -------------------------------------------------- |
| react-router                       | 8.5.0  | Navegação SPA e URLs — MIT                         |
| lucide-react                       | 1.61.0 | Ícones SVG reutilizáveis — ISC                     |
| @fontsource/roboto-condensed       | 5.3.0  | Fonte local, sem Google Fonts em runtime — OFL-1.1 |
| @playwright/test (desenvolvimento) | 1.64.1 | Testes reais de navegador e capturas — Apache-2.0  |

Versões fixas, compatibilidade verificada com React/Node existentes. Nenhuma
dependência foi adicionada à API. A configuração de build define explicitamente
`NODE_ENV=production` no processo web, pois o `.env` compartilhado da API define
`development`. Isso evita empacotar o runtime de desenvolvimento do React sem
alterar o ambiente do backend. O wrapper é JavaScript portátil, sem cross-env.

## Estados demonstrativos

- Aviso claro de demonstração em todas as telas do layout.
- Busca sem distinção de acentos; filtros Rotas/Circuitos/Popular operam apenas
  sobre o módulo local. A aba Ao vivo mostra ausência de transmissões.
- Favoritos, curtida, comentários e menus mudam somente o estado em memória.
  Recarregar a página restaura os exemplos. Não existe persistência.
- No Ride, os valores são estáticos, o GPS informa desconexão e a câmera é
  uma imagem. Pausar/retomar altera somente a apresentação da prévia.
- Gravar, trocar câmera, salvar sessão, editar perfil, entrar em comunidades,
  solicitar acesso, compartilhar e cadastrar moto estão indisponíveis.
- Nenhuma chamada a GPS, sensores, câmera, WebSocket ou serviços de mapas.

## Lista de verificação por tela

| Referência        | Implementação conferida                                                                                    | Diferenças conhecidas                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Início            | Logo/cabeçalho, banner Alagoas, três modos, último Ride, mapa/telemetria, três prévias sociais e aba ativa | Fotos temporárias; ícones reconstituídos; grades adaptadas abaixo de 390 px                                        |
| Explorar          | Pesquisa, quatro filtros, mapa/controles, circuito, rotas próximas, cards compactos e aba ativa            | Terreno e traçados ilustrativos; Ao vivo apresenta estado vazio, sem falsa transmissão                             |
| Modo Misto        | Título, modo, velocímetro SVG, oito métricas, progressos, mapa, câmera e três controles                    | Estados alterados para DEMO/sem gravação; sem satélites ativos; símbolo central de moto em SVG lateral             |
| Perfil/Comunidade | Avatar, XP, bio, quatro estatísticas, moto, medalhas, publicação/comentários, grupos e ranking             | Avatares ilustrativos reutilizados; fotos/fonte/logo aproximam os originais; colunas empilhadas em telas estreitas |
| Garagem           | Link/aba selecionada, identidade consistente e indicação da Parte 04                                       | Provisória, conforme solicitado                                                                                    |

Não se alega reprodução pixel a pixel. Para eliminar as diferenças restantes,
são necessários os arquivos originais da marca, a identificação da fonte e as
fotografias isoladas aprovadas. Não houve mudança da identidade ou criação de
uma linguagem separada para desktop.

## Verificação e evidências

O conjunto automatizado de navegador cobre cinco páginas em 320, 360, 375, 390,
430, 768 e 1440 px, verifica largura do documento, imagens carregadas, console,
erros JavaScript e ausência de requisições externas. Testa também navegação SPA,
histórico, avatar, busca/filtros, favorito, menus/Escape, mapa, modo de pilotagem,
estados do Ride, comentários e indisponibilidade dos controles futuros.

Capturas das quatro referências nas sete larguras ficam em
`.local/screenshots/{inicio,explorar,ride,comunidade}-{largura}.png` (28 arquivos
gerados, ignorados pelo Git). Foram inspecionadas visualmente em mobile, tablet
e desktop. A inspeção encontrou e levou à correção de uma biografia estreita,
rótulos cortados no mapa e diferenças na proporção dos painéis.

Os testes de navegador usam o Chrome instalado e o preview do build de produção
na porta 5174. Gere `pnpm build` antes de `pnpm --filter @apex-ride/web test:e2e`.
O Playwright inicia e encerra esse preview, sem precisar de API ou banco.

Preservação verificada por SHA-256 dos 12 arquivos de código/configuração da API
e do diretório database: nenhum alterado. Os dois endpoints, Compose e esquema
permanecem os da Parte 01. A pendência anterior de Docker/PostGIS continua
registrada na Parte 01; esta parte não executou migrações ou alterou serviços.

## Resultado final

| Comando / verificação                   | Resultado efetivamente observado                                              |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`        | Aprovado, lockfile consistente                                                |
| `pnpm check`                            | Aprovado: tipos, lint sem avisos, formatação, testes e builds                 |
| Testes Vitest                           | 35 aprovados: 23 API/ambiente e 12 frontend, preservando os testes anteriores |
| `pnpm --filter @apex-ride/web test:e2e` | 11 aprovados no Chrome sobre o build de produção                              |
| Carregamento responsivo                 | Cinco páginas nas sete larguras, sem overflow horizontal ou imagens quebradas |
| Console das páginas                     | Sem erros de console ou exceções JavaScript nas verificações                  |
| Requisições externas                    | Nenhuma nas cinco páginas demonstrativas testadas                             |
| Capturas                                | 28 PNGs das quatro telas nas sete larguras, em `.local/screenshots/`          |
| Preservação API/banco                   | SHA-256 conferido em 12 arquivos; nenhum alterado                             |
| Segredos no build web                   | Senha e URL do banco local ausentes; valores não impressos                    |
| Runtime de produção                     | Confirmado; sem `jsx-dev-runtime` ou React development no bundle              |
| Encerramento                            | Servidor de preview dos testes encerrado; portas 5173 e 5174 livres           |

O arquivo JavaScript principal final tem aproximadamente **238 KB minificados /
75 KB gzip**, com páginas secundárias em chunks separados. Não há alerta de
chunk acima de 500 KB no build final. Os testes exibem avisos de terminal sobre
`NO_COLOR`/`FORCE_COLOR` herdados do ambiente; isso não é um erro da aplicação.

Permanecem apenas as diferenças de recursos visuais descritas na lista por tela
e a pendência de infraestrutura da Parte 01. Funcionalidades futuras continuam
fora desta entrega. Não foram executadas migrações nem deploy.

Referências técnicas: [React Router declarativo](https://reactrouter.com/start/declarative/installation)
e [Lucide para React](https://lucide.dev/guide/react/).
