# Etapa 4 de 14 — Explorar, navegação, GPX e elevação

Registro local de 24/10/2026. **Implementação disponível; homologação externa
pendente.** Sem deploy, acesso à VPS, alteração de outro projeto ou início da
Etapa 5. Alterações anteriores do workspace foram preservadas.

## A. Diagnóstico anterior

Consultados README, auditoria de lançamento, plano de refinamento, rotas/Parte
11, relatórios das Etapas 1–3, design system, MapLibre, OSRM, PostGIS, circuitos,
Ride/GPS, Histórico/Replay, similaridade e testes. As nove imagens representam
oito telas distintas; a landing foi anexada duas vezes. Explorar é a principal.

Já existiam rotas versionadas, editor, moderação, favoritos, mapas reais,
acompanhamento no Ride e circuitos com verificação. A descoberta inicial
restringia resultados a AL, havia categoria "Ao vivo" sem fonte funcional,
filtros comprimidos e OSRM somente com `steps=false`. Faltavam navegação por
manobras, destinos, GPX e perfil altimétrico de planejamento.

## B. Interface

Busca no topo, filtros em drawer com aplicar/limpar, categorias
Rotas/Circuitos/Destinos/Favoritos/Meus percursos, eventos contextuais, mapa
dominante e Criar percurso vermelho sobre o mapa. Cinco abas inferiores
preservadas. Filtros e seleção ficam na URL; busca tem debounce de 250 ms e
paginação de 20 resultados. UF não é obrigatória.

Cards mostram geometria cadastrada, distância, duração aproximada, favoritos,
categoria e status reais. Não atribuem uma foto genérica de praia a uma rota.
O módulo de descobertas de trajetos semelhantes continua abaixo da lista.

## C. Mapa

MapLibre GL JS 6.15.0 e estilo escuro OpenFreeMap existentes reutilizados, com
atribuições do estilo, zoom, enquadramento, seleção, busca por área e raio de
precisão. Sem dados, não há rota demo. Visão inicial Brasil, ajustada aos
resultados; localização depende de ação explícita.

O smoke com OpenFreeMap real verificou tiles vetoriais, atribuição, zoom,
ausência de overflow e GPS desligado. Somente sessão/dados são fixtures nesse
smoke. Nos E2E determinísticos, a base cartográfica é uma fixture identificada;
MapLibre/WebGL continuam reais. Capturas desses testes não homologam OSRM.

Mapas são carregados nas páginas lazy; fontes atualizam incrementalmente.
ResizeObserver, listeners, marcadores e instância são removidos ao desmontar.
O chunk MapLibre continua acima de 500 kB, separado da entrada; aviso de build
conhecido, sem ocultar o tamanho.

## D. Busca

Rotas consultam PostgreSQL/PostGIS com autorização existente. UF, município,
categoria, distâncias, tipo, favoritos, autoria e ordenação são filtros reais.
API aceita até 50 resultados/página; a UI usa 20. Não há restrição permanente AL.

Endereços: `POST /api/routes/geocode`, sessão e CSRF, exclusivamente HTTPS em
`api.maptiler.com`, seleção explícita e atribuição. Entrada 3–160 caracteres,
NFC, sem controles, país BR, até cinco resultados, timeout 6 s, redirects
proibidos, corpo até 250 kB, 20 buscas/minuto/conta, quatro requisições de
provedores simultâneas por processo. URL de usuário não define host de destino.
Chave fica no backend e não retorna em mensagens.

Sem configuração: seleção no mapa/coordenadas e mensagem objetiva. Ambiguidade,
ausência e falha não geram destino fictício. Termos só são enviados ao tocar
Buscar endereço. Não há cache persistente de consultas: retenção/cache exigem
validação contratual e de privacidade do operador.

## E. Editor

Editor existente organizado em definir percurso, revisar trajeto, informações
e salvar. Mantém origem, paradas, destino, reordenação, remoção, cálculo viário,
desenho manual identificado e circuitos. Destinos/coordenadas complementam mapa.
Falha de cálculo preserva pontos e geometria anterior.

Rascunho temporário em sessionStorage é separado por conta/ID e restaurado por
ação explícita; não equivale a salvamento no servidor. Falha/quota de storage
preserva trabalho em memória. Edição continua retirando publicação/verificação
até revisão. Detalhes mantêm favoritos/moderação e oferecem navegação de rotas,
exportação GPX própria e cópia de link aprovado.

## F. Navegação

`/explorar/navegar` é protegido e interno. `POST /api/routes/directions` solicita
OSRM `steps=true`, `geometries=geojson`, `overview=full`. `/routes/calculate`
mantém o contrato `steps=false`. Timeout 8 s, corpo 2 MB, 2–25 paradas,
10.000 vértices na rota, 1.000 manobras/30.000 vértices de passos. Seis
cálculos/minuto/conta, concorrência compartilhada de quatro. Sem fallback reto.

Backend normaliza tipo, modificador, posição, via, instrução em português,
geometria, distância, duração, trecho e distância acumulada. Valida medidas,
coordenadas, continuidade, chegada e correspondência com a rota. Campos ausentes
não viram nomes/curvas inventados. `driving` depende do grafo implantado e não
prova um perfil próprio de motocicletas; não há trânsito/obras/interdições ao vivo.

Máquina testável fora da UI: idle/planning/ready/navigating/inaccurate/off-route/
recalculating/offline/arrived/paused/ended/error. Duas leituras confiáveis para
orientar, precisão até 20 m, idade até 10 s, descarte de saltos e verificação de
continuidade. No máximo uma manobra por leitura; posição imóvel não avança.
Chegada exige três leituras por pelo menos quatro segundos e proximidade ao fim.

Desvio: três leituras por cinco segundos fora de `max(25 m, 2 × precisão)`.
Recálculo tem cooldown de 30 s e preserva destino/paradas pendentes. Falha
mantém a rota anterior e suspende instrução antiga. GPS degradado/perdido
suspende orientação. Offline mantém geometria em memória, sem novas vias.

Mesmo GpsPreview/watch do Ride e do compartilhamento social. Navegar não cria
Ride, XP ou compartilhamento. Pausa/finalização/cancelamento do Ride preserva
GPS necessário à navegação; encerrá-la preserva o Ride. Somente versão aprovada
pode ser vinculada ao Ride. Rascunho pode ser navegado; Navegar e registrar abre
Ride independente para esse caso. Circuitos continuam no modo pista.

Voz opcional com speechSynthesis, ativação manual, pt-BR, cancelamento ao
degradar/silenciar/terminar/sair. Depende do navegador/dispositivo. Mapa pode
acompanhar ou ser explorado. Itinerário viário entre paradas pode diferir de
desenho manual/GPX salvo.

Reabertura conserva somente nome/paradas por conta na aba; sem GPS armazenado,
sem iniciar automaticamente, exige revisão/novo cálculo. Plano completo em
memória não sobrevive ao reload. Sem promessa de segundo plano, tela bloqueada,
tiles offline completos ou recálculo offline. Atividades locais foram preservadas.

## G. GPX

Parser SAX saxes 6.0.0 em worker: `.gpx` até 2 MB, 10.000 pontos, 100 segmentos,
profundidade XML 32 e prazo 10 s. Rejeita XML inválido, DTD/entidades,
coordenadas inválidas, altitudes fora de −500–9.000 m, horários inválidos/fora
de ordem e estrutura/namespace inválidos. Não busca URLs contidas no arquivo.

Remove duplicatas adjacentes. Lacunas maiores que 2 km ou 120 s separam
segmentos sem ligar pontas. Usuário escolhe um segmento contínuo com pelo menos
dois pontos. Horários são validados e descartados com aviso. É planejamento,
não histórico de Ride validado: sem XP/conquista/publicação automática.

Exportação contém somente planejamento próprio autorizado, escape XML e
altitude bruta disponível. Não exporta GPS privado de terceiros nem publica Ride.

## H. Elevação

Fonte implementada: altitudes do GPX, precisão desconhecida. Não há DEM
contratado; OSRM não é fonte altimétrica. Altitude GPS antiga sem qualidade
adequada não foi convertida em nova estatística confiável.

Método derivado `elevation-1`: distância geodésica, mediana de três amostras,
histerese vertical 3 m, quebra de lacunas espaciais >1 km e rejeição de salto
acima de `max(50 m, 0,6 × distância entre pontos)`. Nulos não viram zero; não
soma através de lacunas. Cinco amostras válidas mínimas para gráfico. Exibe
fonte/método/qualidade desconhecida e seleção acessível de ponto no mapa.

Altitudes brutas ficam separadas em `routes.import_metadata` com fonte e versão.
Migração aditiva `033_route_import_metadata.sql`; 001–032 preservadas. Alterar
pontos/fonte limpa metadados incompatíveis. Sem reescrever estatísticas antigas
ou geometrias de Rides utilizados. Não foi criado um segundo sistema de rotas.

## I. Circuitos

Publicação, verificação de área fechada, linha, sentido, versões e voltas
mantêm as regras. Sugestão/rascunho/análise/verificação são distintos. Nenhuma
rota foi promovida a pista, nem criado ranking de velocidade em via pública.

## J. Segurança

GPS somente por ação explícita. Explore reutiliza coletor, valida a leitura e
encerra sua consulta após posição confiável; marcador indica posição consultada,
sem acompanhamento ao vivo. Negação/timeout/baixa precisão permitem explorar.
Sem histórico adicional ou publicação de posição no servidor.

Sessão/CSRF nos endpoints novos; autorização existente nos dados privados.
Altitudes não saem na listagem pública, somente em detalhe permitido. Bloqueios,
grupos, eventos, privacidade e limiares de agregados da similaridade preservados.

## K. Provedores

| Recurso          | Estado local                    | Configuração/condições                                                                        |
| ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| Mapa             | OpenFreeMap real validado       | `VITE_MAP_STYLE_URL` opcional; atribuições preservadas                                        |
| OSRM             | Não configurado                 | `ROUTING_OSRM_URL`, `ROUTING_OSRM_PROFILE`, `ROUTING_OSRM_TOKEN`, servidor próprio/contratado |
| MapTiler         | Chave ausente/autorização false | `GEOCODING_MAPTILER_KEY`, `GEOCODING_AUTHORIZED=true`, somente backend                        |
| Elevação externa | Ausente                         | GPX disponível; DEM depende de integração/contrato                                            |
| Parser           | Local                           | saxes ISC, xmlchars MIT; avisos preservados                                                   |

`GET /api/routes/providers` expõe capacidades, sem credenciais. Flag de
autorização não substitui contrato. Não foi contratada conta, alterada quota
ou feita cobrança. Custo OSRM depende de infra/grafo; MapTiler depende de plano
e quota do operador. Limites internos não garantem caber no plano comercial.

Fontes primárias: [OSRM Route service](https://project-osrm.org/docs/v5.24.0/api/),
[MapTiler Geocoding API](https://docs.maptiler.com/cloud/api/geocoding/),
[termos MapTiler](https://www.maptiler.com/terms/),
[OpenFreeMap Quick Start](https://openfreemap.org/quick_start/) e
[licença saxes v6.0.0](https://github.com/lddubeau/saxes/blob/v6.0.0/LICENSE).

## L. Testes

`pnpm check` passou: typecheck, lint, format:check, testes e build. API: 276
testes aprovados; web: 499; total 775. Os 369 testes PostgreSQL são separados
do comando padrão. Rodadas direcionadas PostgreSQL/PostGIS aprovaram 158 casos
distintos: rotas (13), eventos, histórico, comparações, similaridade (92 no
conjunto dessas cinco suítes), autenticação e Rides (66).

O timeout padrão de 5 s de um teste de voltas estourou durante execução
concorrente com build/testes; a repetição isolada com `--testTimeout=20000`
aprovou os 13 casos de rotas. Nenhum teste foi retirado. Banco usa schemas
temporários isolados, sem operações em produção.

Regressão Playwright: 109 cenários distintos validados em 24 arquivos,
considerando a rodada completa e as repetições direcionadas. A rodada completa
teve 107 aprovados e dois casos a repetir; as cinco suítes repetidas com build
estável tiveram **28/28 aprovados** (design system, Explorar/navegação,
interface, rotas e similaridade). Rodada em desenvolvimento não substitui a de produção:
offline depende do precache do build, e cabeçalhos CSP são aplicados no preview.
O cenário de evento/Ride falhou em desenvolvimento e passou integralmente
na repetição dos quatro cenários em preview. A primeira rodada preview também
revelou fechamento prematuro do combobox após mudança de layout na nova posição
da descoberta: corrigido reposicionamento ao rolar/redimensionar, com teste
unitário e repetição de teclado. Um teste de similaridade coincidiu com a
reconstrução dos artefatos e recebeu falha HTTP; os três testes de similaridade
passaram com build estável. O relatório não apresenta a primeira rodada como
um comando integralmente verde. Logs locais em `.local/refinamento4-*.log`.

Novos testes cobrem limites de provedores/OSRM compatível, GPX/XML malicioso,
horários/segmentos/duplicatas, elevação matematicamente verificável, qualidade
GPS/saltos/desvio/chegada/cooldown, falha de recálculo, conta trocada e Ride/GPS
compartilhado. PostGIS verifica filtros/metadados privados e ausência de Ride/XP.

E2E usa API/PostgreSQL reais, OSRM sintético em HTTP loopback exclusivo dos testes
e geocodificação explicitamente simulada na UI. Não é homologação externa ou
ensaio de condução física. Nenhum teste anterior foi desabilitado.

## M. Capturas

Galeria: `.local/screenshots/refinamento4/index.html`. Oito larguras: 320, 360,
375, 390, 430, 768, 1024, 1440 px. Cenas: Explorar vazio/com rotas sintéticas,
filtros, editor novo/GPX, elevação, circuito, conversão, falha de recálculo e rota
recalculada. Fixtures identificadas separadamente dos tiles reais. Sem GPS
pessoal. Oito referências originais disponíveis na galeria para comparação.

São **90 capturas do aplicativo**: 82 dos cenários controlados e oito com tiles
OpenFreeMap reais. Recálculo em andamento foi capturado em 390/1440 px;
as dez demais cenas têm as oito larguras. As oito referências são separadas.

## N. Comparação visual

Preto/grafite, vermelho Racing, tipografia esportiva, busca, categorias, mapa,
callout Criar percurso, cards e cinco abas seguem a hierarquia da referência.
Filtros ficam em drawer. Capturas inspecionadas; estouros de largura corrigidos.

Diferenças: vetor escuro em vez de satélite sem contratação, categorias com
fonte real, favoritos/dados reais, miniatura geométrica em vez de fotografia
atribuída sem origem, estados vazios, avatar/região reais. Contorno de iPhone e
barra iOS não são componentes web. Não se declara fidelidade pixel a pixel.

## O. Arquivos

- Web: `pages/ExplorePage.tsx`, `pages/RoutePages.tsx`, `components/maps/RouteMap.tsx`,
  `components/routes/PersistedRouteCard.tsx`, `components/Layout.tsx`, `App.tsx`,
  `services/routes.ts`, `ride/controller.ts`, `events/LiveProvider.tsx`,
  `components/design-system.tsx` e seus testes. Combobox mantém pesquisa ao
  reposicionar; rascunho recuperável não é sobrescrito antes da decisão do dono.
- Novos: `navigation/{controller,types,context,NavigationProvider,NavigationPage}`,
  `routes/{DestinationSearch,GpxImporter,gpx,gpx.worker,elevation,ElevationProfile}`,
  `styles/explore.css`, `styles/navigation.css` e testes.
- API: `config/env.ts`, `modules/routes/{routes,mutations,routing,validation}`,
  novos `directions.ts`/`geocoding.ts`; testes de provedores/PostGIS e fixture
  HTTP exclusiva do runner de navegador.
- Contratos/migração: `packages/ride-core/routes.d.ts`,
  `database/migrations/033_route_import_metadata.sql`.
- Dependências/documentação: package web/lockfile, `.env.example`, README,
  progresso, THIRD_PARTY_NOTICES, licença saxes e este relatório.
- E2E: `explore-navigation.spec.ts`, adaptação real de categorias/filtros em
  `interface.spec.ts`, runner e smoke de mapa real.

## P. Pendências

**Etapa 4 não homologada para produção.** Faltam MapTiler autorizado, OSRM
próprio/contratado com grafo/perfil adequado, validação de manobras/recálculo
nesses provedores e ensaios em aparelhos físicos. DEM externo, precisão
certificada, mapas offline completos e segundo plano não foram disponibilizados.
Critérios dependentes de provedor real permanecem bloqueados; mocks não os aprovam.

## Q. Preparação para a Etapa 5

Navegação global separada do Ride, GPS compartilhado, instruções normalizadas,
estados de qualidade, versões existentes, GPX privado e altitude separada podem
ser reutilizados. A Etapa 5 não foi iniciada.
