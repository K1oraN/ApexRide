# Parte 10/23 — Offline, armazenamento local e sincronização

Entrega local em 23/10/2026. Escopo definido pelo texto anexado: exclusivamente
Parte 10, sem avançar para rotas/circuitos da Parte 11 e sem deploy.

## A. Funcionalidades implementadas

Gravação incremental no IndexedDB, continuidade sem API enquanto o navegador
executa GPS/sensores, finalização e resumo offline, decisão de salvar/descarte,
recuperação após recarga, fila persistente, sincronização automática/manual,
retentativas, proteção contra duas abas, alertas de armazenamento e shell offline.
Um mesmo fluxo atende Passeio, Pista e Misto, preservando dados indisponíveis.

## B. Arquivos principais

| Arquivos                                                                                                        | Responsabilidade                                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/src/offline/database.ts`, `repository.ts`                                                             | Esquema, migração, transações, cursores, isolamento por dono e leases     |
| `apps/web/src/offline/coordinator.ts`                                                                           | Checkpoints, recuperação e integração com o controlador existente         |
| `apps/web/src/offline/connectivity.ts`, `storage.ts`, `sync.ts`                                                 | API acessível, quota, fila, classificação de falhas, lotes e recibos      |
| `apps/web/src/offline/device.ts`, `context.ts`, `OfflinePanel.tsx`                                              | Contexto local sem segredos, estados e consulta de atividades locais      |
| `apps/web/src/ride/controller.ts`, `RideProvider.tsx`, `RideSummary.tsx`                                        | Ciclo de vida, salvamento local e confirmação posterior do servidor       |
| `apps/web/src/services/{motion,speed}/telemetry.ts`, `services/telemetry/session.ts`                            | Acesso incremental às séries existentes                                   |
| `apps/web/src/auth/AuthProvider.tsx`, `garage/GarageProvider.tsx`, `garage/context.ts`                          | Recuperação do contexto autorizado, isolamento e motos locais para o Ride |
| `apps/web/src/pages/RidePage.tsx`, `components/maps/RideMap.tsx`, `styles/ride-session.css`                     | Estados discretos e traçado sem cartografia                               |
| `apps/web/scripts/service-worker.mjs`, `build.mjs`, `src/main.tsx`, `index.html`, `public/manifest.webmanifest` | Geração e instalação do shell versionado                                  |
| `apps/api/src/modules/rides/persist.ts`, `routes.ts`, `sync-routes.ts`                                          | Persistência existente reutilizada e novos endpoints resumíveis           |
| `database/migrations/007_offline_sync.sql`                                                                      | Uploads privados e lotes únicos por conta/atividade/índice                |
| `apps/web/src/offline/*.test.ts`, `fixtures.ts`                                                                 | IndexedDB, falhas, quota, leases, fila, contas, conectividade e retomada  |
| `apps/web/e2e/offline.spec.ts`, `ride-fixtures.ts`, `rides.spec.ts`                                             | Cenários offline reais no Chrome e regressão do fluxo de salvamento       |
| `apps/api/test/rides.postgres.test.ts`                                                                          | Integração dos lotes com PostgreSQL/PostGIS                               |
| `README.md`, `docs/progresso.md`, `docs/offline.md`, este relatório e README de migrações                       | Operação, contratos e homologação pendente                                |

Nenhuma biblioteca nova em produção. `fake-indexeddb` foi adicionada somente ao
ambiente de testes, com lockfile atualizado. Os arquivos já estavam sem rastreamento
no Git antes do trabalho; não houve commit ou remoção de trabalho anterior.

## C. IndexedDB

Esquema 2, sessão formato 1. Stores de sessões, GPS, sensores, velocidade
processada, eventos, fila e metadados. Chaves por conta/sessão e índices de ordem
evitam misturar proprietários ou duplicar amostras. Migração incremental adiciona
velocidade sem apagar o esquema inicial. Falhas de versão, bloqueio, transação e
quota são explícitas. Só `transaction.complete` confirma persistência local.

## D. Sessões

O controlador e os serviços anteriores continuam coletando os dados. Checkpoints
a cada 2 s e em transições escrevem os deltas. Pausa/retomada preservam intervalos
e segmentos. Finalização consolida os dados, abre o resumo e aguarda a decisão;
salvar insere a fila atomicamente. Descarte confirmado remove somente o registro
selecionado. A recuperação encerra a sessão interrompida no checkpoint efetivo;
não registra o período com a página fechada e não reinicia GPS automaticamente.

## E. Sincronização

Fila durável com tentativas, próximo prazo, erros classificados e recibos.
Revalidação de identidade, CSRF, verificação da API e lease transacional precedem
os envios. Backoff exponencial com variação; sincronização nova aguarda o fim da
captura. Lock expirado não permite sobrescrever a confirmação de outra aba.
Resposta perdida mantém o mesmo clientId e a repetição confirma o registro
existente. Dados não enviados nunca são limpos automaticamente.

## F. Backend

`POST /api/rides` preservado, com transação e unicidade por owner/clientId.
Adicionados `POST /api/rides/sync/:clientId`, `/batches/:index` e `/complete`.
Manifestos e lotes são imutáveis e têm hash canônico. Lotes de 500 itens por série
aceitam repetição e ordem arbitrária. A conclusão exige todos os lotes e usa a
mesma validação e persistência do endpoint original. Atividades parciais não
entram na listagem. Migração 007 aplicada ao banco local.

## G. Interface

Paleta, velocímetro, mapa, cards, botões principais, modos e navegação Racing Tech
preservados. Indicadores distinguem online/offline, conexão limitada, servidor
indisponível, gravação local, pendência, envio, erro e confirmação. Consulta simples
de atividades no aparelho, repetição e limpeza de cópias confirmadas. Sem tiles,
o traçado GPS continua visível em SVG, com aviso de ausência da base.

## H. Testes e evidências

Resultados executados em 23/10/2026: **517 cenários distintos aprovados**.

| Verificação                                         | Resultado                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| TypeScript, lint, formatação e build (`pnpm check`) | Aprovados                                                                           |
| Suíte padrão                                        | 375 aprovados: 149 API/núcleo e 226 web                                             |
| PostgreSQL/PostGIS real (`pnpm test:postgres`)      | 105 aprovados                                                                       |
| Chrome/Playwright                                   | 37 aprovados: 29 na execução geral e 8 na reexecução direcionada de `rides.spec.ts` |
| Migração local (`pnpm db:migrate`)                  | Aplicada                                                                            |
| Android/iPhone físicos                              | Pendentes, sem alegação de homologação                                              |

O runner `pnpm --filter @apex-ride/web test:e2e` cria esquemas PostgreSQL e
diretórios de fotos temporários isolados. Não utiliza dados de contas existentes.
Os testes PostgreSQL ficam ignorados na suíte padrão e foram executados
separadamente; não são contados duas vezes.

Cobertura nova: esquema e migração v1→v2, leitura após reabertura, amostras
incrementais, sensores, série assistida, abortos/quota, versões futuras,
recuperação interrompida, fila atômica, descarte, limpeza protegida, duas abas,
lease expirado, autenticação, troca de conta, backoff, resposta perdida e retomada.
Backend testado com duplicação concorrente, lotes fora de ordem, falta de lotes,
conflitos, CSRF, propriedade, GPS inválido, eventos recalculados e 50.000 pontos
em 100 lotes. O endpoint antigo também continua coberto por regressão.

Chrome: perda de rede com pausa/retomada/finalização, recarga totalmente offline,
resumo pendente, início de novo Ride com contexto local, descarte, retorno da API,
confirmação PostgreSQL, recuperação de sessão interrompida e API 503. Cache
inspecionado para confirmar ausência de API e tiles. Capturas em
`.local/screenshots/offline-{320,390,430,1440}.png`, além das capturas anteriores
de preparação, sensores e telemetria. Inspeção visual local das composições.

Durante a regressão, o fallback da Garagem inicialmente ocultava o erro de rede;
isso foi corrigido, preservando erro/nova tentativa naquela tela e permitindo o
uso das motos em cache somente no Ride. O teste de resposta perdida foi adaptado
ao fluxo novo: salvamento local confirmado e repetição pela fila. O teste offline
passou a distinguir o status da atividade do aviso de mapa indisponível.
Uma execução geral encontrou amostragem instável no teste de velocímetro:
o polling coincidia com o reset GPS de 1 s, embora a captura mostrasse 38 km/h
entre consultas. O teste passou a consultar a cada 50 ms, sem alterar o estimador;
os oito cenários Ride passaram na reexecução direcionada. Os outros 29 cenários
de navegador já haviam passado no build final.

O build mantém aviso de tamanho do chunk do MapLibre/Ride; não impede a geração
do shell. Homologação física e medição de bateria/memória em aparelhos reais
permanecem pendentes, conforme o [roteiro completo](offline.md).

## I. Limitações

Sem garantia de GPS com tela bloqueada, aba suspensa ou navegador fechado. A
recuperação cobre somente transações confirmadas; amostras recentes podem ser
perdidas. IndexedDB não é armazenamento criptografado e pode ser removido pelo
navegador ou usuário. Persistência protegida pode ser negada. Não há primeiro
acesso offline, mapas completos offline, exportação de contingência ou retomada
da captura de uma sessão recuperada. Erros permanentes ficam preservados para
intervenção; o editor de payloads enfileirados não faz parte desta entrega.
Retenção de uploads incompletos exige revisão operacional, sem TTL destrutivo.

## J. Preparação para a Parte 11

Sessões têm identificador estável, conta, moto, modo, privacidade, timestamps,
segmentos GPS, qualidade e versões. Rotas/circuitos poderão consumir esses dados
persistidos, sem criar outra coleta ou supor pontos nos intervalos ausentes.
Nenhum circuito, reconhecimento de rota, compartilhamento, vídeo ou replay foi
implementado. Contratos, armazenamento e roteiro estão em [offline.md](offline.md).
