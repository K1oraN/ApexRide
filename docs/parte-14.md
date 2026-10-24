# Parte 14/23 — Comparação de atividades na mesma rota

Entrega local em 23/10/2026, com os blocos 14A–14D. Manual de arquitetura,
políticas, API, operação e roteiro físico em [comparacoes.md](comparacoes.md).

## A–G. Funcionalidade e interface

Seleção de 2–4 sessões associadas ao mesmo percurso, filtros de moto/cilindrada
e região da rota, paginação, análise própria por posição, cobertura e quatro
estados de comparabilidade. Mesma geometria aprovada em versões numéricas
distintas é aceita; geometria alterada é recusada. Pausas, desvios, rejeições e
lacunas interrompem o alinhamento.

O motor usa índice espacial, sequência temporal, direção observada e progresso
anterior. Cobertura é a união dos trechos observados e a comparação usa sua
interseção. Gráficos por distância distinguem GPS/Assistido, tempo total/segmento
e sensores disponíveis. G exige calibração/versão compatíveis. Inclinação
dinâmica continua ausente no esquema anterior, sem valores fictícios.

MapLibre reutilizado, GPS próprio segmentado sobreposto, referência planejada,
trechos comuns, zoom, centralização, resumo lado a lado e qualidade. Integrações
pela rota, Histórico e retorno do Replay. Design Racing Tech, velocímetro e cinco
abas preservados; somente cores comparativas foram adicionadas onde necessárias.

## H–J. Comunidade, circuitos e API

Consentimento comunitário e técnico separados, desativados inicialmente.
Terceiros em vias comuns somente em agregados de células fixas, sem GPS,
horários ou séries de desempenho. Mínimo configurável de dez contas distintas,
peso por participante e supressão de grupos pequenos. Sem materializações ou
cache público; autorização revalidada após processamento e revogação imediata
nas novas consultas.

Circuitos verificados permitem telemetria autorizada e comparação de uma volta
persistida por atividade, com método, qualidade, sentido, linha e geometria
compatíveis. Não há ranking. Coordenadas e horários absolutos de terceiros
continuam ausentes das respostas técnicas.

Endpoints: candidatas, comparar, estatísticas comunitárias, opt-in e comparação
de voltas. Autenticação, CSRF, propriedade, IDs, limites de payload, paginação,
rate limiting e processamento limitado. Migrações aditivas 013/014 aplicadas
localmente. Reutilizados PostGIS e versões de rotas da Parte 11.

## B. Principais arquivos

- Criados: `packages/ride-core/comparison.js` e `.d.ts`;
  `apps/api/src/modules/comparisons/{policy,service,routes}.ts`;
  `apps/web/src/comparison/`; `apps/web/src/pages/ComparisonPage.tsx`;
  `apps/web/src/styles/comparison.css`; migrações 013/014; testes
  `comparison.test.ts`, `comparisons.postgres.test.ts` e `comparison.spec.ts`.
- Modificados: export do pacote compartilhado; registro Fastify; resumo do
  histórico; router React; detalhes de rota/atividade; controles de privacidade;
  Replay; suporte opcional a cores no RouteMap; estilo dos novos opt-ins;
  runner PostgreSQL; `.env.example`, README e progresso.

## K. Validação

TypeScript, lint, formatação e builds aprovados. A suíte padrão passou em
**478 cenários** (174 API/contratos e 304 frontend). A suíte completa com
PostgreSQL/PostGIS real passou em **147 cenários**, incluindo 15 novos de
comparação/autorização. Os 17 testes geográficos/contratos da Parte 14 incluem
50.000 pontos e 5.000 segmentos, com amostragem limitada e execução dentro do
orçamento de 2 s.

No Chrome, **50 cenários distintos foram aprovados**, combinando a regressão
completa dos 48 anteriores com os dois novos fluxos da Parte 14. Na execução
completa, a confirmação de revogação falhou por remontagem do bloco de controles
quando `updated_at` mudava. A correção mantém o estado confirmado sem recarregar
esse bloco; os dois cenários novos passaram depois **duas vezes cada**, no build
final (quatro execuções). O teste da Parte 14 cobre duas a quatro seleções,
limite/duplicatas, filtros, mapa, gráficos, parcial, offline/retentativa,
consentimento/revogação, ID não autorizado e ida/volta do replay.

Responsividade verificada em **320/360/375/390/430/1440 px**. Capturas completas
e detalhes de mapa/gráfico foram inspecionados visualmente. O build mantém o
aviso de tamanho do chunk cartográfico existente; o chunk da comparação tem
cerca de 19 kB antes de gzip. Isso não substitui medições em aparelhos físicos.

Comandos executados: `npx --yes pnpm@10.34.7 check`, `test:postgres`,
`--filter @apex-ride/web test:e2e` e reexecução dirigida
`--filter @apex-ride/web test:e2e comparison.spec.ts --repeat-each=2`, além de
`db:migrate`, TypeScript, lint e builds durante a implementação. A suíte padrão
omite os testes PostgreSQL quando não há `TEST_DATABASE_URL`; estes foram
executados separadamente pelo runner real, sem serem contados como aprovação
na execução padrão.

As suítes utilizam dados sintéticos e schemas de banco isolados. Capturas ficam
em `.local/screenshots/comparison-*.png`; nenhum dado fictício foi inserido na
exploração real.

## L–M. Limites e futuro

Homologação Android/iPhone físicos e memória nesses dispositivos pendentes.
Sem comparação offline completa; seleção preservada e retentativa explícita.
Categorias desconhecidas não são deduzidas; o mapeamento verificável começa
vazio. Geometrias ambíguas podem ficar indisponíveis. Séries usam primeira
passagem por posição; seleção de voltas exige atividades distintas.

O motor geográfico isolado poderá ser reutilizado por uma futura origem de
candidatos. A Parte 15, reconhecimento automático de trajetos semelhantes,
não foi iniciada. Não houve deploy, ranking, gamificação ou recursos sociais.
