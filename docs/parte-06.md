# Entrega da Parte 06 — Sessões de Pilotagem

Data: 23/10/2026. Implementação local, sem deploy e sem avanço à Parte 07.

## A. Resumo

Implementado o fluxo real: garagem e principal → Passeio/Pista/Misto → GPS
autorizado → iniciar → acompanhar → pausar/retomar → confirmar término → resumo
→ privacidade → salvar no PostgreSQL/PostGIS ou descartar. Dados de sessão não
são enviados antes da escolha Salvar. A prévia GPS anônima anterior continua
disponível sem moto e sem gravação. Autenticação, garagem e navegação foram
reutilizadas. Os módulos futuros continuam com demonstrações identificadas.

## B. Arquivos principais

Criados:

- `packages/ride-core/{package.json,index.js,index.d.ts}`.
- `apps/web/src/ride/{controller.ts,controller.test.ts,context.ts,RideProvider.tsx,RideSummary.tsx,format.ts}`.
- `apps/web/src/services/rides.ts`, `apps/web/src/styles/ride-session.css`.
- `apps/api/src/modules/rides/{routes.ts,validation.ts}`.
- `apps/api/test/{rides.test.ts,rides.postgres.test.ts}`.
- `apps/web/e2e/rides.spec.ts`, `database/migrations/003_rides.sql`.
- `docs/sessoes.md` e este relatório.

Modificados: `App.tsx`, `Layout.tsx`, `RidePage.tsx`, `RideMap.tsx`,
`rideMapController.ts`, o tipo `GpsSnapshot`, o registro de rotas `app.ts`,
manifests/lockfile/workspace, runners de testes, o fixture de limpeza da Garagem
e as expectativas antigas de controles indisponíveis no Ride. ESLint e Prettier
agora ignoram `.local`, que contém binários e evidências locais. README,
arquitetura, manual GPS, migrações e controle de progresso foram atualizados.

## C. Estados

Preparação, aguardando GPS, em andamento, pausada, finalizada, salvando, salva,
descartada e erro. O controlador único fica acima das páginas. Não permite
reinício, retomada ou envio fora dos estados válidos. Navegação interna preserva
atividade e watch único; logout pausa e oculta dados até o proprietário entrar.

## D. Métricas

Tempo ativo por intervalos reais, total entre início/fim e pausa pela diferença.
Distância haversine entre pontos aceitos do mesmo segmento, com limiar de
oscilação e proteção de saltos. Velocidade atual/máxima exclusivamente do GPS,
filtrando picos; média por distância / tempo ativo, incluindo paradas sem pausa.
Unidades km/h, km e hh:mm:ss. Nenhum acréscimo artificial ou dado avançado fictício.
Regras compartilhadas e limites documentados no [manual](sessoes.md).

## E. Banco

Migração `003_rides.sql` aplicada, preservando checksums das anteriores.
Tabelas `rides` e `ride_points`, pontos `geography(Point,4326)`, índice espacial,
FKs, timestamps e idempotência por proprietário. Gravação transacional em lotes
de mil pontos. Arquivamento da moto preserva as atividades.

A pendência PostGIS local das partes anteriores foi resolvida: cópia isolada dos
diretórios `bin/lib/share` do PostgreSQL 17 em `.local/postgres-runtime`, com
PostGIS Bundle 3.6.2 obtido pelo [canal oficial](https://postgis.net/documentation/getting_started/install_windows/released_versions/)
e [distribuição OSGeo](https://download.osgeo.org/postgis/windows/pg17/).
O cluster existente `.local/postgres-auth/data`, loopback 55432, foi reiniciado
usando essa cópia; o serviço do Windows em 5432 e a instalação em Program Files
foram preservados. A extensão foi habilitada no banco local.

Para parar/reiniciar este cluster, use o runtime com PostGIS:

```powershell
& .\.local\postgres-runtime\bin\pg_ctl.exe stop -D .\.local\postgres-auth\data -m fast -w
Start-Process -FilePath "$PWD\.local\postgres-runtime\bin\postgres.exe" -ArgumentList '-D',"$PWD/.local/postgres-auth/data",'-p','55432','-h','127.0.0.1' -WindowStyle Hidden
```

Mantenha esse runtime disponível enquanto usar esse cluster. Em outro ambiente,
use o Compose/PostGIS existente ou instale PostGIS compatível antes de migrar.
Não volte a iniciar o cluster por um executável sem as bibliotecas PostGIS.

## F. API

`POST /api/rides`, `GET /api/rides?offset=0`, `GET /api/rides/:id`.
Sessão autenticada em todos; CSRF/origem para escrita. Moto precisa pertencer
ao usuário. Consulta completa sempre restrita ao proprietário, inclusive pública.
Servidor recalcula métricas e rejeita horários/pontos inconsistentes.
Repetição idêntica retorna o mesmo ID; conteúdo diferente com a mesma chave recebe 409. Limites: 50 mil pontos, 20 MiB, 48 horas, 2 mil períodos ativos; nenhum
descarte silencioso. Listagem paginada de 50 registros, sem coordenadas.

## G. Interface

Preservados tokens, preto/grafite, vermelho Racing, fontes, velocímetro, painéis
de telemetria, mapa e cinco itens inferiores. Preparação usa foto real da moto,
select de garagem e modo existente; os controles aprovados receberam as ações
da sessão. Resumo usa os mesmos painéis/tokens, com métricas reais, mapa completo
e marcadores I/F. Recursos futuros mantêm indicadores indisponíveis.

Uma colisão entre o CSS do resumo novo e o card ilustrativo da Home foi detectada
pela inspeção das capturas e corrigida com classes próprias `session-summary`.
Além de overflow, o teste verifica a largura útil do mapa e das colunas de métricas.

## H. Testes e evidências

| Verificação                                      | Resultado                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                     | TypeScript, lint, formatação, testes unitários e build aprovados                                                               |
| Suíte padrão                                     | 153 aprovados: 65 API/núcleo + 88 frontend; testes PostgreSQL executados separadamente                                         |
| `pnpm test:postgres`                             | 91 aprovados: 79 regressões de autenticação/Garagem + 12 sessões com PostGIS real                                              |
| `pnpm --filter @apex-ride/web test:e2e`          | 30 cenários Chrome, incluindo três modos no mesmo cenário, regressões anteriores, falha após commit, nova tentativa e descarte |
| `pnpm db:check`                                  | PostgreSQL acessível e PostGIS habilitado através da API                                                                       |
| `pnpm --filter @apex-ride/web test:map-provider` | OpenFreeMap real, três respostas de tiles, atribuições visíveis e 320/390/1440 px sem overflow                                 |

O total das três suítes é **274 cenários**. Na integração de sessões, salvar
50.000 pontos verificou persistência sem corte; um trigger de teste forçou falha
no segundo ponto para confirmar rollback completo e nova tentativa. Há testes
de acesso entre contas públicas/privadas, CSRF/origem, idempotência concorrente,
arquivamento da moto, geografia SRID4326, pausas, lacunas e validação.

Responsividade geral em 320/360/375/390/430/768/1440 px. Preparação e resumo em
320/360/390/430/768/1440 px, com PNGs em `.local/screenshots/ride-preparation-*`
e `ride-summary-*`, inspecionados visualmente. GPS simulado ou emulado apenas em
testes identificados; mapa real testado à parte sem ativar GPS.

Na primeira execução dos novos testes de navegador, a simulação de deslocamento
na pausa excedia o filtro de salto e cadastros excederam o limite de oito por IP.
Os cenários foram ajustados para tempo físico coerente e contas reutilizadas
entre modos; não foram enfraquecidas as regras da aplicação. Os comandos de
smoke exigem iniciar API e preview; inicialmente recusaram conexão sem esses
processos e passaram após iniciá-los. O build mantém o aviso conhecido do chunk
MapLibre acima de 500 kB, sem falha de compilação.

## I. Limitações

Homologação física Android/iPhone pendente; roteiro no [manual](sessoes.md).
Nenhuma pilotagem real foi testada. Sem fila offline ou recuperação após reload.
O aviso de fechamento e GPS em segundo plano não são garantidos em celulares.
Lacunas não são reconstruídas. Distância e filtros são estimativas que exigem
validação física. Coordenadas do navegador podem ser falsificadas; esta etapa
valida integridade, não certifica trajetos para competição.

Se a conexão cair depois do commit, a atividade pode já existir no servidor;
repetir envio confirma o mesmo ID. Descartar após erro apaga somente os dados
temporários, conforme aviso, sem apagar atividade já recebida. Escolha de
privacidade fica congelada desde a primeira tentativa para preservar idempotência.

## J. Preparação para Parte 07

Controlador, fonte GPS, núcleo de métricas e API estão separados. Um módulo futuro
de sensores poderá correlacionar amostras temporais com o UUID da sessão e
evoluir o banco por nova migração. Nenhum acelerômetro, giroscópio, orientação,
força G, inclinação ou GPS Assistido foi implementado antecipadamente.
