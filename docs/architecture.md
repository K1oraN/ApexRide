# Arquitetura inicial

## Estado após a Parte 23

React/Vite em `apps/web`, API Fastify em `apps/api` e contratos/cálculos em
`packages/ride-core` compõem o monorepo existente. PostgreSQL/PostGIS tem 32
migrações e 93 tabelas de aplicação verificadas no ensaio sintético. Contas,
Garagem, Ride/GPS/sensores, histórico/replay/comparação, rotas, comunidade,
grupos, eventos/GPS social, XP e administração estão na [matriz final](qa-matriz.md).
Vídeos/exports ficam no IndexedDB do aparelho; fotos do servidor usam volume privado.

O `RideProvider` mantém sessão e GPS entre páginas; `LiveProvider` reutiliza o
coletor com consentimento separado e interrompe o compartilhamento temporário
em perda de rede/visibilidade. Gamificação usa ledger e filas; administração
usa RBAC/MFA/sessão privilegiada e auditoria. O Service Worker guarda somente
o shell, sem cache de APIs ou mídias privadas.

A Parte 23 preservou a arquitetura e corrigiu CORS de produção, headers e
correlação HTTP, checksum de migração independente de CRLF/LF e números
fictícios da Home. Há [decisão NO-GO](parte-23.md), [runbook](qa-operacao.md) e
[limites mobile](qa-mobile.md); dispositivos e operação produtiva não estão
homologados. As seções abaixo preservam a evolução histórica.

## Fundação original

Este documento registra a arquitetura estabelecida na Parte 01. A evolução de
interface e navegação está documentada em [Parte 02](parte-02.md). O diagnóstico
de API descrito abaixo permanece em `/tecnico`; as demais páginas usam exemplos
locais. Backend e banco mantêm os mesmos contratos.

O monorepositório usa pnpm workspaces, sem pacotes compartilhados artificiais.
Frontend e backend possuem builds e testes independentes. O Git foi inicializado;
não foram criados commits, remotos ou deploy.

## Fluxo

```text
React → services/api.ts → GET /api/health → Fastify
                         GET /api/health/db → pool pg → PostgreSQL + PostGIS
```

No desenvolvimento, o Vite encaminha `/api` ao backend. O frontend não recebe
credenciais de banco nem chama o endpoint de banco automaticamente. A página
consulta a API ao montar, limita a espera a cinco segundos e cancela a requisição
ao desmontar; falhas são mostradas como indisponibilidade, sem dados simulados.

`App.tsx` é o ponto de composição para o futuro roteamento. Não foi instalada
biblioteca de rotas enquanto existe uma única página. O HTML possui viewport
mobile, o CSS admite larguras pequenas e o frontend gera assets estáticos. Não
há manifest, Service Worker, cache offline ou módulos de produto nesta entrega.

## API

`buildApp` separa a composição Fastify do processo servidor, permitindo testes
por `inject` sem portas abertas. O módulo `health` recebe o serviço de banco;
o serviço real encapsula um pool `pg` com limite de conexões e timeouts.
O pool é criado na inicialização; a conexão é aberta sob demanda. Assim a saúde
da API pode continuar respondendo quando o banco estiver indisponível.

| Endpoint             | Sucesso                                                   | Falha                                       |
| -------------------- | --------------------------------------------------------- | ------------------------------------------- |
| `GET /api/health`    | 200: `status=ok`, `service=apex-ride-api`                 | Erro inesperado: mensagem genérica          |
| `GET /api/health/db` | 200: `status=ok`, `database=connected`, `postgis=enabled` | 503: `status=error`, `database=unavailable` |

A verificação de banco executa `SELECT postgis_version() AS version`: abrir uma
conexão PostgreSQL sem a extensão funcional não é suficiente. O driver real não
usa dados simulados. O código não registra strings de conexão ou erros brutos de
banco. Há logs de requisição, eventos de falha sem credenciais e mensagens HTTP
genéricas. CORS restringe o acesso de navegadores; não substitui autenticação,
que não pertence a esta parte. Rotas desconhecidas retornam 404.

Em SIGINT/SIGTERM o Fastify encerra as requisições e chama `pool.end()` através
de `onClose`. O processo possui um limite para encerramento. Falhas de ambiente
ou bind impedem a inicialização com código de saída diferente de zero.

## Banco e evolução

O Compose mantém o PostgreSQL 17/PostGIS 3.6 em um volume persistente, usa
SCRAM-SHA-256 para conexões TCP e publica somente a porta local 55432. TLS com
validação completa é obrigatório na configuração da API para hosts remotos.
O uso de conta administrativa pertence exclusivamente ao ambiente local.
Permissões de produção serão definidas na etapa correspondente.

`database/init/` habilita a extensão; `database/migrations/` reserva o local de
evolução do esquema. Não existem tabelas de usuários, motos, sessões ou rotas.
Futuras funcionalidades podem adicionar módulos à API e páginas ao web, sem
antecipar seus contratos nesta fundação.

## Referências técnicas consultadas

- [Requisitos de execução do Vite](https://vite.dev/guide/).
- [Política LTS do Fastify](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md).
- [Imagem PostgreSQL/PostGIS e linhas compatíveis](https://github.com/postgis/docker-postgis/blob/master/README.md).
- [Registro npm](https://registry.npmjs.org/): versões estáveis e peer dependencies.

## Evolução da Parte 03

As descrições anteriores registram a fundação original. Contas agora usam o
módulo `apps/api/src/modules/auth`, cookies de sessão e tabelas PostgreSQL
versionadas em `001_auth.sql`. `Database.pool` compartilha o pool real entre
saúde e autenticação; os contratos dos endpoints técnicos foram preservados.
A migração é explícita via `pnpm db:migrate`.

No React, `AuthProvider` restaura a sessão pela API, `RequireAuth` protege áreas
pessoais e `services/auth.ts` centraliza cookies, CSRF e erros. O cabeçalho e o
perfil reutilizam o design da Parte 02 com identidade real. Os módulos futuros
continuam com demonstrações locais isoladas. Veja [autenticação](autenticacao.md)
e [Parte 03](parte-03.md) para contratos, segurança e resultados.

## Evolução da Parte 04

`modules/motorcycles` utiliza o mesmo pool e os auxiliares de sessão/CSRF
extraídos para `modules/auth/session.ts`. A migração `002_motorcycles.sql`
acrescenta motos e uma fila de limpeza de fotografias. Operações de escrita
serializam pelo registro do proprietário; um índice único parcial reforça a
unicidade da moto principal. Arquivamento preserva os dados da moto para uma
referência histórica futura, sem criar tabelas de atividades.

`PhotoStorage` separa o diretório privado local de uma futura implementação de
objetos. Arquivos são reencodificados e servidos exclusivamente pelo backend,
com autorização e `no-store`. Não existe mapeamento estático de uploads.

No React, `GarageProvider` centraliza a listagem real entre Garagem e perfil;
o cliente existente de autenticação também envia fotografias binárias com CSRF.
Formulários e detalhes exigem `RequireAuth`. A entrada anônima em `/garagem`
apresenta convite para login, sem motos. Ver [Garagem](garagem.md) e
[Parte 04](parte-04.md). Essas descrições registram a evolução daquela parte.

## Evolução das Partes 05 e 06

GPS Puro e MapLibre foram integrados na Parte 05. A Parte 06 mantém um único
controlador de sessões no `RideProvider`, acima das rotas, reutilizando o serviço
GPS e o mapa. Moto e privacidade vêm dos providers existentes. Atividades ficam
em memória até o resumo e a decisão de salvar; não há fila offline.

`packages/ride-core` compartilha contratos e cálculo entre web e API, sem nova
biblioteca externa. O módulo `modules/rides` valida dados e propriedade, recalcula
métricas e grava `rides`/`ride_points` por transação idempotente, com PostGIS
SRID4326. Consultas são exclusivas do proprietário, independentemente da
visibilidade. Ver [sessões](sessoes.md) e [Parte 06](parte-06.md).

## Evolução da Parte 07

`MotionCapture` isola APIs, permissões, normalização e interrupções do navegador.
`CalibrationWindow` define a montagem e `MotionProcessor` transforma e filtra
aceleração linear. `MotionTelemetry` mantém buffers limitados, série de até 5 Hz,
qualidade e integração ao controlador existente. Somente os componentes de
sensores assinam a atualização rápida; GPS e mapa mantêm seus mecanismos.

O contrato opcional `motion` usa tipos e estatísticas compartilhados em
`packages/ride-core/motion`. `POST /api/rides` normaliza/recalcula os dados e
persiste as tabelas aditivas `ride_motion`/`ride_motion_samples` na mesma transação
dos pontos GPS, preservando idempotência e consultas exclusivas do proprietário.
Inclinação dinâmica fica indisponível até homologação física. Não há fusão de
velocidade nem avanço à Parte 08. Ver [sensores](sensores.md).

## Evolução da Parte 11

O módulo `modules/routes` centraliza consulta PostGIS, criação, favoritos,
roteamento OSRM configurável e moderação restrita. `packages/ride-core/routes`
compartilha projeção/progresso/desvio e voltas GPS estimadas com web e backend.
O controlador Ride e os checkpoints/manifestos offline existentes recebem apenas
um campo opcional de plano selecionado, distinto de seus pontos GPS reais.
Versões aprovadas sobrevivem à edição/arquivamento para permitir sincronização
posterior. A transação de sessão confere a versão e recalcula resultados e
voltas. Não há outro sistema de atividades. Consulte [manual](rotas.md) e
[relatório da Parte 11](parte-11.md).

## Evolução da Parte 12

O histórico reutiliza `rides`, pontos, sensores, velocidade processada, eventos e
voltas. A listagem é leve e paginada; detalhes dividem metadados, mapa e séries
reduzidas, com componentes MapLibre/gráficos existentes. A redução dos gráficos
foi compartilhada em `ride-core/charts`, sem alterar o método anterior.
`history-stats` agrega por proprietário e filtros no PostgreSQL; não transfere
todas as atividades para somar no React.

As migrações 011/012 acrescentam metadados, snapshot da moto, exclusão lógica,
índices e tombstones por client ID. O protocolo offline preserva seus lotes e
recibos; o histórico concilia cópias locais/remotas e cancela exclusões sob o lease
já utilizado pela sincronização. O DTO público é separado e não contém mapas,
coordenadas ou telemetria. Perfil privado prevalece sobre atividade pública.
Ver [manual](historico.md) e [relatório](parte-12.md). A Parte 13 não foi iniciada.

## Evolução da Parte 15

O módulo `modules/similarity` prepara GPS original, indexa geometrias privadas em
PostGIS e consulta candidatos espacialmente limitados. Triggers enfileiram o
processamento secundário; um worker com lease/token e checkpoint versionado
executa o backfill em lotes. Não há comparação global de todos os pares nem
varredura retroativa repetida depois do checkpoint concluído.

O alinhador e o serviço de comparação da Parte 14 recebem referências derivadas
com partes e janelas temporais. São reutilizados cálculos, gráficos, mapas e
autorização; pausas/lacunas não viram conectores. Grupos privados exigem pares
integrais entre todos os membros. A comunidade recebe somente agregados em
municípios/categorias/cilindradas fixos, com consentimento vigente e dez contas.
Não há geometria pública derivada. Migrações 015/016 e importação de polígonos
oficiais IBGE são aditivas. Ver [manual](trajetos-semelhantes.md) e
[relatório](parte-15.md). A Parte 16 não foi iniciada.

## Parte 19 — Comunidades de motociclistas

O módulo `groups` acrescenta grupos e memberships aos usuários existentes.
Membership centraliza pedidos e participação; cargos/permissões, estado,
bloqueios, suspensão, regras e políticas são reavaliados no backend.
`social_posts.group_id` define o destino sem duplicar feed, fotos ou interações.
`group_private` preserva o público original nas mudanças de privacidade.
A mesma autorização SQL protege post, comentário e arquivo por URL direta.

Transações com locks de contas em ordem canônica e advisory lock por grupo
serializam pedidos, cargos, propriedade, convites e operações do feed. Triggers
conferem proprietário e mantêm contadores. Tokens de convite têm 256 bits, hash
persistido, expiração, revogação e limite de usos; o segredo passa em corpo POST.
Cache social é privado/no-store e o cliente separa páginas por identidade.
Sem sincronização social offline, eventos, mapa social ou localização ao vivo.
Veja [relatório técnico da Parte 19](parte-19.md) e [manual](grupos.md).
