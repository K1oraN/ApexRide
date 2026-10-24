# Parte 11 — relatório de implementação

Registro em 23/10/2026. Escopo exclusivo: rotas, circuitos, exploração e
acompanhamento GPS, nos blocos 11A–11D. Não houve deploy ou avanço à Parte 12.

## A. Funcionalidades implementadas

Explorar consulta PostgreSQL/PostGIS, sem exemplos apresentados como percursos
publicados. Busca, filtros, região, paginação, proximidade autorizada, mapa e
estados vazios/erros estão integrados. Há editor por toque, rascunhos, edição,
arquivamento, favoritos, envio para publicação, moderação e verificação de pista.
O Ride existente acompanha a rota, estima progresso/desvio e detecta voltas
estimadas em circuitos verificados. O plano e a associação sobrevivem aos
checkpoints e à sincronização offline anterior.

## B. Principais arquivos criados e modificados

Criados:

- `database/migrations/008_routes.sql`, `009_route_rides.sql`, `010_route_laps.sql`.
- `packages/ride-core/routes.js` e `routes.d.ts`.
- `apps/api/src/modules/routes/{routes,validation,mutations,routing,ride-plan}.ts`.
- `apps/web/src/services/routes.ts`, `pages/RoutePages.tsx`,
  `components/maps/RouteMap.tsx`, `components/routes/PersistedRouteCard.tsx`,
  `styles/routes.css`.
- Testes de consulta/validação/roteamento/PostGIS, progresso, voltas e fluxo Chrome;
  `docs/rotas.md` e este relatório.

Integrações alteradas:

- Registro da API, configuração de ambiente e `.env.example`.
- Contrato opcional `RidePayload.route`, validação e transação existentes de Ride.
- `ExplorePage.tsx`, `App.tsx`, `RidePage.tsx`, controlador Ride, resumo,
  indicação de indisponibilidade de voltas e mapa existente.
- Teste de recuperação IndexedDB; runners PostgreSQL e testes de regressão que
  truncam sessões agora incluem a tabela filha `ride_laps`.
- O teste antigo de exemplos locais de Explorar foi atualizado para o contrato
  real; README, arquitetura, migrações e progresso foram documentados.

Nenhum coletor GPS/sensor, algoritmo de GPS Assistido, cálculo anterior de
telemetria ou protocolo de lotes offline foi substituído. Home, perfil,
comunidade, Garagem, cabeçalho e navegação inferior mantêm sua composição.

## C. Rotas

O editor usa origem, destino e até 23 paradas intermediárias, reordenação e
remoção por toque/botões. O caminho rodoviário é calculado no backend via OSRM
configurável. Falhas preservam pontos e não desenham linhas retas como substituição.
O modo manual exige escolha explícita e fica identificado sem validação viária.
O servidor valida geometria e confere distância em metros com geography.

Salvar cria rascunho privado. A publicação exige envio e revisão por outra conta
autorizada. Toda edição retira publicação/verificação e incrementa a versão,
exigindo novo envio. Exclusão é arquivamento, preservando referências históricas.
Favoritos são idempotentes, persistidos e isolados por conta.

## D. Circuitos

Reutilizam a estrutura comum, com fechamento tolerado em 50 m, linha transversal
orientada e sentido de cruzamento. Estados de publicação e verificação de pista
são distintos. Usuários comuns não verificam circuitos; a decisão administrativa
exige evidência de revisão e confirmação de área fechada autorizada. Revisão de
conteúdo, versão, responsável, data, motivo e geometria ficam registrados.
Nenhum circuito real foi declarado oficial ou verificado nesta entrega.

## E. Mapa

MapLibre e o provedor já utilizado no projeto foram reutilizados. Fontes GeoJSON,
layers e marcadores são atualizados sem reconstruir o mapa a cada leitura ou card.
Explorar preserva mapa, cabeçalho, abas, cards e controles Racing Tech. O editor
permite tocar para selecionar pontos; I/F e números identificam as paradas, A/B
orientam a linha do circuito. O Ride distingue plano tracejado em âmbar e GPS real
em vermelho. Atribuição permanece visível; estilos/tiles não são armazenados offline.
Capturas automatizadas usam uma base cartográfica mínima de teste, sem confundir
isso com teste real do serviço externo.

## F. Acompanhamento

Seleção nos detalhes abre a preparação Ride anterior. O início aguarda o plano
carregado; moto, modos, sensores, GPS Puro/Assistido, pausas e salvamento continuam
no mesmo controlador. O plano é independente do trajeto GPS registrado.

Projeção sobre segmentos, continuidade e união dos trechos observados estimam
progresso sem contar duas vezes retornos. Precisão acima de 20 m suspende a
conclusão de desvio. Afastamento acima de `max(25 m, 2 × precisão)` gera suspeita;
três leituras e pelo menos cinco segundos confirmam afastamento sustentado.
Pausas/lacunas não preenchem trechos faltantes. Não há map matching viário;
vias paralelas dentro da incerteza continuam ambíguas.

Conclusão exige pelo menos 95% de cobertura observada e chegada compatível.
Atividades podem ser salvas parciais, abandonadas ou indeterminadas. Abandonar
em pausa registra o instante: acompanhamento termina ali e o GPS da sessão
continua; medições anteriores ficam preservadas. O backend recalcula resultados
sobre a versão aprovada, sem aceitar percentuais do cliente como autoridade.

## G. Tempos de volta

`LapDetector` exige Modo Pista, circuito verificado, geometria, linha e sentido.
Testa cruzamento do segmento finito e interpola apenas o instante. Exige precisão
até 15 m, amostras separadas por menos de 5 s, mesmo segmento, movimento plausível,
afastamento para rearmar, ao menos 90% de cobertura e intervalo plausível de volta.
Pausa, GPS impreciso, falhas e sentido inverso não produzem voltas válidas.

Resultados são estimativas pessoais de GPS, sem certificação profissional ou
ranking. O resumo mostra quantidade, tempos, melhor estimativa e interrupções.
A API recalcula e persiste os resultados e a qualidade. Verificação posterior ao
início da atividade não cria retroativamente voltas válidas.

## H. Banco de dados

As três migrações aditivas foram executadas no banco local. Tabelas:
`routes`, `route_waypoints`, `route_favorites`, `route_moderators`,
`route_decisions`, `route_versions` e `ride_laps`; novas colunas opcionais em
`rides` para referência, versão, plano e resultado. FKs mantêm integridade;
unicidade impede favoritos/voltas duplicados. Índices GiST de geometria e
geography, GIN textual e índices por publicação/proprietário/favorito/associação
atendem consultas limitadas e paginadas. O original é preservado e apenas as
listagens usam simplificação para exibição.

## I. APIs e permissões

Prefixo `/api`:

- `GET /routes`, `/routes/nearby`, `/circuits`: públicos, somente aprovados.
- `GET /routes/:id`, `/circuits/:id`: aprovado, proprietário ou moderador.
- `GET /routes/mine`, `/routes/favorites`: conta atual.
- `POST /routes`, `/circuits`: autenticado; rascunho.
- `PATCH`, `DELETE /routes/:id`, `/circuits/:id`: proprietário; edição/arquivamento.
- `POST /routes/:id/submit`: proprietário; envio à moderação.
- `POST`, `DELETE /routes/:id/favorite`: conta atual.
- `POST /routes/calculate`: autenticado, limitado, provedor somente no backend.
- `GET /admin/routes`, `/admin/routes/:id/decisions`: moderador autorizado no banco.
- `POST /admin/routes/:id/decisions`: moderador distinto do autor, versão e motivo.
- `POST /rides`, `/rides/sync/*`, `GET /rides/:id`: contratos anteriores estendidos,
  mantendo autenticação, CSRF, autorização do proprietário e idempotência.

Parâmetros, limites, configuração do papel e corpos das decisões estão no
[manual completo](rotas.md). Não existe permissão administrativa enviada pelo
frontend nem criação de outra plataforma de atividades.

## J. Testes executados

- Bloco 11A: validação de consulta e testes reais de publicação, busca, cidade,
  tipo, paginação, ocultação de rascunhos/rejeitados e proximidade PostGIS.
- Bloco 11B: criação, ordem de pontos, extensão, edição, autorização, retirada de
  publicação, favoritos idempotentes, circuito, moderação e falhas/limites OSRM.
- Bloco 11C: progresso, destino isolado, salto, retorno, precisão, desvios, pausas,
  recuperação IndexedDB, salvamento parcial após arquivamento e associação privada.
- Bloco 11D: cruzamentos válidos/inversos, múltiplas voltas, ruído, pausa, lacuna,
  timestamps inconsistentes, circuito não verificado, persistência e recálculo.
- `pnpm check`: TypeScript, ESLint, Prettier, suíte padrão e build.
- `pnpm test:postgres`: regressão real em esquemas temporários isolados.
- `pnpm --filter @apex-ride/web test:e2e`: regressão completa no Chrome.
- `pnpm db:migrate`: migrações aplicadas ao banco local.

Resultados finais: **400 testes unitários/contratos**, **116 com PostgreSQL/PostGIS
real** e **39 no Chrome**, totalizando **555 cenários distintos** aprovados.
TypeScript, lint, formatação e build passaram. Editor, detalhes e resultados
foram verificados em 320/390/430/1440 px; as páginas existentes, em sete larguras.
Capturas móveis foram inspecionadas. Mapas e pontos GPS dos testes são controlados;
não houve homologação física ou chamada a um provedor OSRM real.

Uma execução PostgreSQL concorrente com o Chrome excedeu o timeout de 5 s no
cenário anterior de tentativas de login por IP. A suíte completa foi repetida
sem o navegador e passou em 116/116. O fluxo Chrome foi reexecutado após corrigir
a identificação do seletor e a expectativa textual da confirmação. Após o ajuste
final do instante de abandono, a suíte padrão e os 11 cenários PostgreSQL desta
parte foram novamente aprovados. Os 13 cenários de interface/rotas também passaram
no build final; reexecuções não foram somadas ao total distinto.

Evidências: `.local/parte11-*.log`; capturas: `.local/screenshots/`.

## K. Limitações e pendências

- Configurar servidor OSRM próprio/contratado e validar uma chamada externa real;
  nenhum serviço demo foi selecionado ou utilizado como dependência de produção.
  O adaptador foi testado com respostas controladas, incluindo indisponibilidade.
- Conceder papel de moderação a contas reais após revisão pelo operador; não há
  administrador automático nem conteúdo fictício semeado na exploração pública.
- Homologar Android/iPhone físicos, consumo, montagem, pausas de SO e referência
  de cronometragem. O [roteiro seguro](rotas.md#validação-física-pendente--android-e-iphone)
  usa caminhada e séries controladas; nenhuma pilotagem arriscada é solicitada.
- GPS aproximado, vias paralelas e cruzamentos com baixa precisão continuam
  sujeitos a incerteza. Não há garantia de trafegabilidade nem cronometragem oficial.
- O limite do roteamento é por processo; vários processos exigirão rate limiting
  compartilhado. O build mantém aviso de chunk cartográfico acima de 500 kB.
- Mapas novos dependem de conexão; não há download de tiles ou cache não autorizado.
- Não há voz, recálculo automático, ranking, feed social, replay ou histórico novo.

## L. Preparação para a Parte 12

Atividades salvas já conservam seus `ride_points`, metadados e referência opcional
à versão planejada. `route_snapshot`, `route_result` e `ride_laps` permitem ao
histórico futuro consultar os resultados sem confundir plano com trajeto real.
Edição/arquivamento de percurso não apagam sessões ou suas associações. A Parte 12
não foi iniciada.
