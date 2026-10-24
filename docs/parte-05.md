# Parte 05 de 23 — GPS e mapa em tempo real

Data: 23/10/2026. Implementação no projeto existente, com interface Racing Tech,
velocímetro, cartões, câmera ilustrativa, container do mapa e navegação preservados.
Sem deploy e sem avanço para a Parte 06. Homologação física pendente.

## A. Funcionalidades implementadas

Em `/ride`, **Ativar GPS** solicita localização explicitamente. Após autorização,
o navegador fornece posição, precisão, velocidade, direção e altitude quando
disponíveis. O mapa mostra marcador, precisão aproximada e percurso temporário.
Pan/zoom suspendem a câmera; **Acompanhar motociclista** a restaura. A coleta
funciona independentemente da disponibilidade do mapa e da Garagem/login.
**Encerrar GPS**, desmontar Ride ou `pagehide` encerra recursos e descarta dados.
Ocultar a página suspende a inscrição; retornar retoma somente a prévia já ativa,
aguardando nova leitura e separando segmentos. Não há sessão gravada ou salva.

## B. Arquivos criados e alterados

| Caminho                                                                          | Ação e finalidade                                                                       |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/src/services/gps/config.ts`                                            | Criado: opções e limites centralizados                                                  |
| `apps/web/src/services/gps/geolocation.ts`                                       | Criado: watch único e proteção de callbacks                                             |
| `apps/web/src/services/gps/readings.ts`                                          | Criado: tipos, validação, Haversine e conversão                                         |
| `apps/web/src/services/gps/track.ts`                                             | Criado: segmentos efêmeros e memória limitada                                           |
| `apps/web/src/services/gps/preview.ts`                                           | Criado: estado, permissões e ciclo de vida                                              |
| `apps/web/src/hooks/useGpsPreview.ts`                                            | Criado: integração React e encerramento no desmontar                                    |
| `apps/web/src/components/maps/mapConfig.ts`                                      | Criado: URL de estilo e câmera                                                          |
| `apps/web/src/components/maps/previewGeometry.ts`                                | Criado: GeoJSON de rota/precisão                                                        |
| `apps/web/src/components/maps/rideMapController.ts`                              | Criado: instância, fontes, câmera e limpeza                                             |
| `apps/web/src/components/maps/RideMap.tsx`                                       | Criado: mapa dentro do container aprovado                                               |
| `apps/web/src/components/telemetry/GpsIndicator.tsx`                             | Criado: indicadores textuais reais                                                      |
| `apps/web/src/components/telemetry/Speedometer.tsx`                              | Alterado: aceita ausência de dados e origem GPS, preservando uso demonstrativo anterior |
| `apps/web/src/components/telemetry/Metrics.tsx`                                  | Alterado: barra visual vazia sem representar medição de zero nos módulos indisponíveis  |
| `apps/web/src/pages/RidePage.tsx`                                                | Alterado: integração real e controles explícitos de prévia                              |
| `apps/web/src/styles/gps.css`                                                    | Criado: mapa, avisos e marcador com tokens existentes                                   |
| `apps/web/src/vite-env.d.ts`, `.env.example`                                     | Alterados: URL pública configurável do estilo                                           |
| `apps/web/package.json`, `pnpm-lock.yaml`                                        | Alterados: MapLibre 6.15.0, tipos GeoJSON 7946.0.16 e comando smoke                     |
| `apps/web/src/services/gps/testFixtures.ts`                                      | Criado: posições fictícias exclusivas de testes                                         |
| `apps/web/src/services/gps/readings.test.ts`, `track.test.ts`, `preview.test.ts` | Criados: validação, velocidade, segmentos, qualidade e ciclo de vida                    |
| `apps/web/src/hooks/useGpsPreview.test.tsx`                                      | Criado: StrictMode e limpeza no desmontar                                               |
| `apps/web/src/components/maps/rideMapController.test.ts`                         | Criado: fontes, marcador, câmera e recursos                                             |
| `apps/web/e2e/gps-fixtures.ts`, `gps.spec.ts`                                    | Criados: mapa determinístico e GPS emulado no Chrome                                    |
| `apps/web/e2e/interface.spec.ts`                                                 | Alterado: regras atuais do Ride e mapa externo interceptado só nos testes               |
| `apps/web/scripts/check-map-provider.mjs`                                        | Criado: smoke opt-in com OpenFreeMap real, sem solicitar GPS                            |
| `docs/licenses/MapLibre-GL-JS-LICENSE.txt`                                       | Criado: licença BSD distribuída com a biblioteca                                        |
| `README.md`, `docs/progresso.md`, `docs/gps.md`, `docs/parte-05.md`              | Atualizados/criados: operação, arquitetura, relatório, progresso e roteiro físico       |

Não foram alterados backend, endpoints, migrações, componentes de autenticação,
perfil, Garagem ou navegação inferior. Nenhum reset do banco foi executado.

## C. Geolocalização

`watchPosition` recebe as leituras com `enableHighAccuracy=true`, cache máximo de
2 s e timeout de 12 s. Não há frequência fixa. Coordenadas/precisão/timestamp são
validados sem arredondamento; duplicatas e pontos fora de ordem são descartados.
Idade máxima de 15 s, tolerância futura de 5 s e precisão boa de até 50 m.
Saltos descontam as incertezas antes de comparar deslocamento com 100 m/s.
Falhas, precisão ruim, interrupções e lacunas de pelo menos 15 s quebram a linha.
No máximo 2.000 pontos ficam em memória. Nenhuma leitura é enviada à API,
PostgreSQL, WebSocket, logs, ferramentas de análise ou armazenamento persistente.

## D. Velocidade

O número do velocímetro vem exclusivamente de `coords.speed × 3,6`.
Zero válido é mostrado como zero; `null`, dados inválidos, antigos ou com precisão
reduzida mostram **—**. Não há estimativa, correção arbitrária ou GPS Assistido.
O valor original em m/s permanece separado do número formatado em km/h.
Duração, distância, médias/máximas, inclinação e forças continuam indisponíveis.

## E. Mapa

MapLibre GL JS 6.15.0 (BSD-3-Clause), worker Vite próprio e OpenFreeMap Dark
configurável por `VITE_MAP_STYLE_URL`. Dados OpenStreetMap/OpenMapTiles com
atribuições visíveis. O provedor permite uso comercial sem chave, sem SLA;
consulte [as condições e atribuições](https://openfreemap.org/) e a
[política de privacidade](https://openfreemap.org/privacy/).
Marcador vermelho com borda branca, orientação opcional confiável e precisão
aproximada. Uma camada vermelha contém os segmentos, sem reconstruir o mapa por
leitura. Antes do GPS, Maceió é apenas uma vista inicial identificada.
Sem satélite licenciado configurado: usa-se mapa real escuro.

Requests de tiles revelam ao provedor a região visualizada e dados de conexão;
a interface informa isso antes da ativação. Não há anonimato garantido perante o
provedor, mesmo sem envio de leituras ao backend do Apex Ride.

## F. Permissões e erros

Não solicita GPS na abertura nem em login, cadastro, perfil ou Garagem.
Negações encerram recursos e orientam revisar as configurações do navegador.
Revogação é observada pela Permissions API quando disponível, com fallback para
o erro de geolocalização. Timeout e indisponibilidade permitem nova tentativa
manual e recuperação do watch existente. Leituras antigas removem a velocidade;
falhas do mapa não encerram a coleta. Falta de suporte/HTTPS mantém o painel
acessível com explicação. Não há contagem de satélites ou barras inventadas.

## G. Testes executados

| Verificação                                      | Resultado                                                                                                              |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                     | TypeScript API/web, lint sem avisos, formatação, testes e builds aprovados                                             |
| Suíte padrão, incluída em `check`                | 119 passaram: 41 API e 78 frontend; os 79 de banco são executados separadamente                                        |
| `pnpm test:postgres`                             | 79 passaram, em esquemas temporários isolados; autenticação e Garagem reais                                            |
| `pnpm --filter @apex-ride/web test:e2e`          | 26 passaram no Chrome; 7 novos cenários GPS e 19 de regressão                                                          |
| `pnpm --filter @apex-ride/web test:map-provider` | OpenFreeMap real: 3 respostas vetoriais, atribuições visíveis e ausência de overflow em 320/390/1440 px; GPS desligado |
| Responsividade automatizada                      | Páginas em 320/360/375/390/430/768/1440 px; formulários e Garagem em suas larguras existentes                          |
| Inspeção visual                                  | Capturas mobile/desktop do Ride, incluindo base real escura e créditos legíveis                                        |

Total das suítes: **224 cenários aprovados**, mais o smoke do provedor real.
O GPS dos testes é fictício/emulado, inclusive no cenário que usa a própria API
do Chrome com permissão concedida pelo contexto de teste. Os testes principais
de mapa interceptam o provedor para não depender da rede. O smoke é separado,
acessa a infraestrutura real e não fornece localização do dispositivo.

Uma primeira execução concorrente de banco e navegador excedeu o timeout de 5 s
de um teste de autenticação; a reexecução isolada passou os 79. O teste de saída
do Ride foi ajustado para aguardar a conclusão da navegação/limpeza React.
A execução final do navegador passou integralmente. O lint também foi repetido
fora da criação/remoção concorrente de artefatos do Playwright.
Uma repetição do navegador durante a reconstrução de `dist` encontrou arquivos
temporariamente ausentes; a validação final usa build concluído antes do preview.

O build emite aviso de chunk do Ride acima de 500 kB devido ao MapLibre
(aproximadamente 295 kB gzip, mais worker). O Ride já é carregado por rota lazy;
o aviso não foi ocultado nem o limite aumentado artificialmente.

## H. Limitações e homologação

Testes físicos **não executados** em Android e iPhone. Precisão, disponibilidade
de velocidade/heading, consumo de bateria e permissões variam por aparelho e
sistema. Não há garantia de coleta em segundo plano, tela bloqueada ou PWA.
As interrupções são explícitas e não inventam posições intermediárias.
O [manual GPS](gps.md) contém o roteiro seguro para homologar os dois aparelhos.
Satélite licenciado e eventual hospedagem cartográfica própria continuam pendentes.
PostGIS ausente no cluster local é uma pendência anterior preservada; esta parte
não depende de PostGIS nem altera a verificação de saúde do banco.

## I. Preparação para a Parte 06

`LocationReading`, `PreviewSegments` e o serviço independente permitem uma futura
camada de sessões associar leituras a usuário, moto selecionada e modo. Essa camada
poderá controlar início/pausa/retomada/salvamento sem acoplar a API do navegador aos
componentes visuais. Nesta entrega não foi criada essa associação nem qualquer
persistência, endpoint, migração ou funcionalidade da Parte 06.

Para repetir o smoke, gere o build, inicie um preview em 5175 e execute o comando:

```powershell
npx --yes pnpm@10.34.7 build
npx --yes pnpm@10.34.7 --filter @apex-ride/web exec vite preview --host 127.0.0.1 --port 5175 --strictPort
# Em outro terminal na raiz:
npx --yes pnpm@10.34.7 --filter @apex-ride/web test:map-provider
```

`MAP_SMOKE_ORIGIN` pode substituir a origem. Capturas ficam em
`.local/screenshots/ride-real-map-{320,390,1440}.png`, ignoradas pelo Git.
