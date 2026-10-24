# Apex Ride — Partes 01 a 22

A Parte 22 adiciona o **Painel Administrativo Central** em `/admin`: permissões
por operação, MFA TOTP, sessões privilegiadas revogáveis, métricas reais,
denúncias/casos, decisões, sanções proporcionais, recursos, supervisão de grupos,
eventos e percursos, integridade de XP/rankings, dupla aprovação, auditoria,
incidentes e solicitações de privacidade. A área do motociclista mantém as cinco
abas e o design Racing Tech. O painel não oferece acesso geral a GPS privado ou
vídeos locais.

Migrações **026–032** são aditivas e pertencem exclusivamente à Parte 22.
Execute `pnpm db:migrate`; configure `ADMIN_MFA_KEY` somente no servidor e siga
o [provisionamento restrito](admin-provisionamento.md) para uma conta existente
e verificada. **Nenhuma conta administrativa padrão é criada.** O primeiro acesso
operacional exige confirmar senha e MFA em `/admin`.

Consulte o [relatório técnico completo](parte-22.md),
[matriz](admin-matriz.md), [guia de moderação](admin-moderacao.md),
[incidentes e privacidade](admin-incidentes.md) e
[roteiro de homologação](admin-homologacao.md). Recuperação sem códigos,
retenção/arquivo, infraestrutura, segurança independente e aparelhos físicos
continuam sujeitos à validação operacional. **Sem deploy ou avanço à Parte 23.**
Os registros abaixo descrevem entregas anteriores em seus respectivos momentos.

A Parte 21 integra **XP confirmado, níveis, conquistas, metas pessoais e rankings
voluntários**. Abra **Perfil → Conquistas e metas / Histórico de XP** e
**Comunidade → Rankings**. O backend calcula os pontos com regras versionadas,
livro-razão imutável, transações, limites e compensações. Sessões privadas e GPS
sem sensores continuam elegíveis; offline recebe XP somente após sincronização.
RSVP não pontua: eventos exigem verificação pós-evento por outra pessoa autorizada.

Execute `pnpm db:migrate` para **025_gamification.sql**. A fila faz backfill
retomável; `pnpm gamification:reconcile` permite execução controlada. Opt-in de
rankings e divulgação do progresso começam desligados. Circuitos mantêm análises
pessoais estimadas, sem classificação pública até homologação técnica. Design
Racing Tech e cinco abas preservados. Consulte o [manual](gamificacao.md),
o [relatório técnico completo](parte-21.md) e o [progresso](progresso.md).
Android/iPhone físicos e Safari real permanecem pendentes. Sem deploy ou Parte 22.
Os registros abaixo descrevem entregas anteriores em seus respectivos momentos.

A Parte 20 integra **eventos, encontros, passeios e mapa social temporário**.
Abra **Comunidade → Eventos**, **Explorar → Eventos** ou `/comunidade/eventos`.
Criação revisada, ponto confirmado, datas/fusos, rotas versionadas, grupos,
convites nominais, presenças e capacidade usam o PostgreSQL/PostGIS existente.

**Confirmar presença e iniciar Ride nunca ativam GPS social.** Durante um evento,
confirmados podem autorizar separadamente público, precisão e prazo de até quatro
horas, limitado ao encerramento. O GPS é reutilizado; há uma posição temporária,
consultas autenticadas a cada cinco segundos, revogação e TTL de 30 segundos.
Parar social preserva Ride; finalizar Ride encerra social. Perda de rede ou página
oculta interrompe a sessão e exige nova autorização, sem fila de coordenadas.

Execute `pnpm db:migrate` para **021–024**, todas pertencentes à Parte 20.
O design Racing Tech e as cinco abas foram preservados. Consulte o
[manual e roteiro Android/iPhone](eventos.md), o [relatório técnico completo](parte-20.md)
e o [progresso](progresso.md). Homologação física continua pendente.
Sem deploy, XP, rankings ou implementação da Parte 21. Os registros abaixo
descrevem entregas anteriores em seus respectivos momentos.

A Parte 19 integra **Grupos públicos e privados** à Comunidade: descoberta por
região/interesse, criação, regras versionadas, membros, pedidos, convites
limitados, cargos, transferência, moderação e feed reutilizando a Parte 18.
Posts, fotografias e listas privadas exigem autorização no backend; grupos não
listados precisam de vínculo ou convite apropriado. No compositor do Histórico,
escolha o grupo em **Destino**. Não existe compartilhamento automático.

Execute `pnpm db:migrate` para `018_groups.sql`, `019_group_indexes.sql` e
`020_group_creation_identity.sql`, todas da Parte 19. Abra **Comunidade → Grupos**
ou `/comunidade/grupos`. Design Racing Tech e cinco abas preservados. Sem deploy
nem implementação da Parte 20. Consulte o [manual físico](grupos.md),
o [relatório completo](parte-19.md) e o [progresso](progresso.md).
Android/iPhone físicos e Safari permanecem pendentes. Os registros abaixo
descrevem as entregas anteriores em seus respectivos momentos.

A Parte 18 conecta a **Comunidade a publicações reais**: texto, até cinco fotos,
moto própria, resumo seguro de Ride, feed geral/Seguindo, curtidas, comentários,
perfis, seguidores, solicitações privadas, bloqueios e denúncias básicas.
O compositor tem prévia e confirmação explícita. Fotos WebP e miniaturas ficam
no armazenamento privado, sem EXIF/GPS, com autorização em cada leitura.

Execute `db:migrate` para `017_social.sql`. Abra `/comunidade` ou use
**Compartilhar na Comunidade** no Histórico. Atividades não são publicadas
automaticamente; vídeos continuam no aparelho. Perfil, post, atividade e
bloqueios são reavaliados pelo servidor. Design Racing Tech e cinco abas
preservados. Consulte o [manual e roteiro Android/iPhone](comunidade.md),
o [relatório técnico](parte-18.md) e o [progresso](progresso.md).
Sem deploy nem implementação de grupos da Parte 19. Aparelhos físicos pendentes.
Os registros abaixo descrevem as entregas anteriores em seus respectivos momentos.

A Parte 17 adiciona **vídeo com telemetria sincronizada e exportação local**.
No Histórico, abra uma gravação da Parte 16 e escolha **Assistir com telemetria**:
prévia Canvas, layouts Racing Tech, indicadores históricos válidos, ajustes de
sincronismo e exportação individual com overlay incorporado aos frames, nos
formatos que o navegador conseguir codificar e validar. Configurações e arquivos
permanecem no aparelho, separados por conta; o original é preservado.

Leia o [manual e roteiro Android/iPhone](video-overlay.md), o
[relatório técnico](parte-17.md) e o [progresso](progresso.md).
A composição é em tempo real, com a página ativa; limite do resultado de 128 MiB.
Prévia/original continuam disponíveis quando a composição não for suportada.
Android/iPhone físicos continuam pendentes. Sem deploy e sem avanço à Parte 18.
Os registros abaixo descrevem as entregas anteriores.

A Parte 16 adiciona **vídeo opcional durante o Ride**, com câmera frontal/traseira,
prévia inline, qualidade, áudio desligado por padrão, gravação real em segmentos
e persistência incremental no IndexedDB. Pausas, retomadas, falhas e trocas
preservam referências temporais e o registro GPS. Resumo e Histórico oferecem
reprodução local, cópia original e exclusão confirmada. Os arquivos permanecem
somente no aparelho; não entram na sincronização nem no backend.

Consulte o [manual e roteiro Android/iPhone](videos.md), o
[relatório completo](parte-16.md) e o [progresso](progresso.md).
Gravações longas e câmeras físicas ainda exigem homologação. A montagem para
reproduzir/copiar um segmento é limitada a 256 MiB para proteger memória; a
captura incremental não recebe limite artificial em minutos. Sem deploy e sem
avanço à Parte 17. Os registros abaixo descrevem as entregas anteriores.

A Parte 15 reconhece **Trajetos Semelhantes pelo GPS registrado**, sem exigir
rota cadastrada. No Histórico, abra uma atividade e escolha **Trajetos
Semelhantes**: correspondências integrais/parciais/contrárias, coberturas A/B,
mapa dos trechos comuns e comparação pelo motor da Parte 14. Grupos são privados
e não presumem equivalência transitiva. Explorar oferece agregados regionais
autorizados, sem mapas ou coordenadas de terceiros.

Execute `db:migrate` para 015/016 e `similarity:regions` para importar os 102
municípios de Alagoas do snapshot oficial IBGE. A fila e o backfill retomável
funcionam no backend. Outras UFs podem ser importadas pelo mesmo comando.
Consulte o [manual](trajetos-semelhantes.md), o
[relatório completo](parte-15.md) e o [progresso](progresso.md).
Design e cinco abas preservados; homologação física pendente. Sem deploy e sem
avanço à Parte 16. Os registros abaixo descrevem as entregas anteriores.

A Parte 14 integra **Comparação de Atividades na Mesma Rota**. Abra uma rota ou
uma atividade sincronizada e escolha **Comparar atividades nesta rota**: seleção
de 2–4 sessões, filtros, cobertura geográfica, trechos comuns, resumos, mapa e
gráficos por distância. O Replay individual permite retornar à comparação.
Consentimento comunitário/técnico separado e inicialmente desativado; terceiros
em vias comuns somente em agregados protegidos de pelo menos dez contas.
Circuitos verificados permitem comparação técnica autorizada de voltas.

Execute `db:migrate` para as migrações aditivas 013/014. Consulte o
[manual de comparações e roteiro físico](comparacoes.md), o
[relatório da Parte 14](parte-14.md) e o [progresso](progresso.md).
Design e cinco abas preservados. Inclinação dinâmica e homologação física
continuam pendentes; offline mantém a seleção e exige reconexão para processar.
Sem deploy e sem avanço à Parte 15. Os registros abaixo descrevem as entregas
anteriores em seus respectivos momentos.

A Parte 13 integra o **Replay Animado de Telemetria** privado ao Histórico.
Abra uma atividade e escolha **Reproduzir Ride**: percurso segmentado, marcador,
velocímetro, sensores disponíveis, cursor dos gráficos, eventos/voltas registrados,
linha do tempo ativa, pausa/retomada, busca e velocidades 0,5×/1×/2×/4×.
Atividades locais com dados suficientes usam o IndexedDB e continuam sem tiles.
O design Racing Tech e as cinco abas foram preservados. Não há nova migração.

Dados ausentes permanecem indisponíveis; pausas/lacunas não geram movimentos
artificiais. Inclinação dinâmica continua não registrada no esquema atual.
O replay completo exige o proprietário e permanece separado do resumo público.
Leia o [manual e roteiro Android/iPhone](replay.md), o
[relatório da Parte 13](parte-13.md) e o [progresso](progresso.md).
Homologação em aparelhos físicos permanece pendente. Sem deploy e sem avanço à
Parte 14. Os registros abaixo descrevem as entregas anteriores.

A Parte 12 conecta o **Histórico de Rides** às atividades reais: listagem paginada,
filtros, detalhes, mapa GPS segmentado, gráficos, eventos/voltas, estatísticas,
edição de metadados, privacidade e compartilhamento. A cópia local usa o IndexedDB
e a sincronização anteriores, conciliada com o servidor pelo identificador da
sessão. Início e perfil usam o último Ride e os totais reais da conta.

Abra `/historico`, `/estatisticas` ou o link de uma atividade salva. As cinco abas
inferiores permanecem iguais. Execute `db:migrate` para as migrações aditivas
`011_history.sql` e `012_ride_deletions.sql`. Exclusão lógica retira a atividade
das consultas e bloqueia reenvios antigos; não é expurgo físico de todas as linhas.

A página `/compartilhar/rides/:id` publica somente resumo autorizado de perfil e
atividade públicos, sem mapa, coordenadas, descrição pessoal ou telemetria sensível.
A privacidade é reavaliada pelo backend em toda consulta. Veja o
[manual do histórico](historico.md), [relatório da Parte 12](parte-12.md)
e [progresso](progresso.md). Android/iPhone físicos e compartilhamento nativo
continuam pendentes de homologação. Não houve deploy nem avanço à Parte 13.
Os registros a seguir descrevem as partes anteriores em seus respectivos momentos.

A Parte 11 conecta **Explorar** ao PostgreSQL/PostGIS e oferece rotas/circuitos,
pesquisa e filtros geográficos, detalhes, editor por toque, favoritos e moderação.
O Ride existente acompanha o plano separado do GPS real, estima progresso/desvio
e voltas em Modo Pista com circuito verificado. O plano continua no IndexedDB e
na sincronização anterior. Execute `db:migrate` para as migrações aditivas 008–010.
Não foram inseridos percursos fictícios na exploração pública.

Abra `/explorar`, entre e escolha **Criar percurso**. Cálculo por vias existentes
exige `ROUTING_OSRM_URL` no backend; sem provedor, os pontos são preservados para
retentativa. O desenho manual é uma escolha explícita, sem validação viária. A
publicação exige revisão por outra conta autorizada em `route_moderators`; a
verificação de circuito para voltas exige uma decisão adicional. Não há conta
administradora automática. Consulte [manual de rotas](rotas.md),
[relatório da Parte 11](parte-11.md) e [progresso](progresso.md).
Android/iPhone físicos e servidor OSRM real configurado ainda precisam de validação.
Não houve deploy nem avanço à Parte 12. Os registros abaixo descrevem as partes
anteriores em seus respectivos momentos; Explorar agora usa dados persistidos.

A Parte 10 integra registro incremental no IndexedDB, recuperação de sessões,
salvamento local e sincronização automática/manual com lotes retomáveis. O design
Racing Tech e os coletores anteriores foram preservados. Execute `db:migrate`
para a migração aditiva `007_offline_sync.sql` e `build` para gerar o Service
Worker. O shell previamente instalado pode abrir offline; `dev` não instala o
worker. Entre online e carregue sua Garagem antes de usar o contexto local.

No Ride, acompanhe **Armazenamento e sincronização** e abra **Atividades no
aparelho**. Finalize, revise o resumo e escolha salvar/descarte; o envio só começa
após salvar. **Salvo no aparelho** e **Sincronizado** são confirmações diferentes.
Internet e GPS são independentes; não existe garantia de coleta com tela
bloqueada, aba suspensa ou navegador fechado. Homologação Android/iPhone físicos
continua pendente. Veja [manual offline](offline.md),
[relatório da Parte 10](parte-10.md) e [progresso](progresso.md).
Sem deploy e sem avanço à Parte 11.

React/TypeScript/Vite, API Fastify e PostgreSQL. A Parte 03 implementa contas,
sessões, perfil e privacidade reais. A Parte 04 implementa a Garagem com cadastro,
edição, fotografias privadas, moto principal e exclusão por arquivamento no
PostgreSQL, mantendo os componentes Racing Tech e os cinco itens de navegação
aprovados. A Parte 05 conecta o Ride ao GPS Puro e a um mapa real, com percurso
temporário somente em memória. A Parte 06 integra sessões reais, pausas,
retomadas, resumo antes de salvar e PostgreSQL/PostGIS. Rotas e conteúdo social
continuam demonstrações identificadas. A Parte 07 adiciona sensores, calibração
e força G longitudinal estimada, com inclinação dinâmica indisponível até
homologação física. A Parte 08 integra GPS Assistido Automático, com GPS Puro
selecionável e preferência por conta, sem alterar as estatísticas baseadas em GPS.
Esses registros históricos das Partes 01–09 são complementados pela Parte 10 acima.

A Parte 09 integra configuração tipada de Passeio/Pista/Misto, eventos passivos
estimados de 0–100 e 100–0, gráficos reais e resumo pessoal, mantendo os componentes
Racing Tech. Passeio mostra métricas básicas; Pista e Misto incluem telemetria
avançada (Misto também funciona em vias comuns). A API recalcula eventos e protege
o acesso por proprietário. Execute `db:migrate` para a migração aditiva
`006_advanced_telemetry.sql`. Tempos de eventos usam medições GPS independentes;
a série assistida fica identificada separadamente nos gráficos. Inclinação
dinâmica e voltas continuam indisponíveis. Resultados são experimentais e não
homologados em aparelhos físicos. Consulte o [manual de telemetria avançada](telemetria-avancada.md)
e o [relatório completo da Parte 09](parte-09.md). Competição e publicação
automática de desempenho continuam fora do escopo; sincronização foi integrada na Parte 10.

No Ride ou nas configurações da conta, escolha **Velocidade da telemetria**.
O padrão é **GPS Assistido Automático**, que utiliza aceleração longitudinal
filtrada somente com GPS recente, sensores e calibração válidos. Sem condições
suficientes, utiliza GPS Puro sem modificar a preferência salva. O velocímetro
identifica estimativas e dados indisponíveis. A migração aditiva
`005_assisted_speed.sql` acrescenta a preferência e a série processada opcional
na atividade; execute `db:migrate`. Leia o [manual de GPS Assistido](gps-assistido.md)
e o [relatório da Parte 08](parte-08.md), incluindo limites, testes sintéticos
e roteiro físico pendente. Nenhum aparelho físico está homologado.

Em `/ride`, toque em **Ativar GPS** para solicitar a permissão e visualizar
posição/velocidade reais quando disponíveis. **Encerrar GPS** ou sair do Ride
encerra a coleta e descarta o percurso. Não exige conta ou moto. Use HTTPS no
telefone; localhost/loopback funcionam para desenvolvimento no computador.
O mapa usa MapLibre e OpenFreeMap Dark, configurável por `VITE_MAP_STYLE_URL`,
com atribuições visíveis. Tiles externos revelam a região visualizada ao provedor.
Essa prévia sem sessão permanece disponível. Com login e moto cadastrada, escolha
o modo e toque em **Iniciar Ride**: a sessão aguarda GPS utilizável e permanece
ativa entre páginas internas. **Pausar/Continuar** separa segmentos; **Finalizar**
pede confirmação e abre o resumo. Escolha Público/Privado e **Salvar atividade**
ou **Descartar atividade**. O envio só ocorre após Salvar, com confirmação real e
proteção contra duplicatas. Na preparação, **Ativar Sensores** solicita movimento
e orientação quando suportados; confirme a montagem e a moto parada/vertical
para **Calibrar sensores**. Sensores são opcionais e não bloqueiam o GPS.
A câmera continua indisponível. Consulte o [manual de sensores](sensores.md)
e o [relatório da Parte 07](parte-07.md). Força G é uma estimativa limitada;
inclinação dinâmica ainda não homologada permanece indisponível. A migração
aditiva `004_motion.sql` salva calibração, qualidade, série selecionada e máximos
com a atividade. Histórico limitado a 18.000 amostras de até 5 Hz, com aviso
explícito se incompleto; a requisição completa admite até 32 MiB.
Execute `db:migrate` antes de usar; PostGIS é obrigatório. Veja o
[manual das sessões e roteiro Android/iPhone](sessoes.md) e o
[relatório da Parte 06](parte-06.md). A Parte 10 acrescenta checkpoints locais
e recuperação somente do que foi persistido; amostras recentes em memória ainda
podem ser perdidas. Não há garantia de GPS com tela bloqueada.
Consulte o [manual GPS e roteiro Android/iPhone](gps.md) e o
[relatório da Parte 05](parte-05.md). Testes físicos ainda estão pendentes.

Após `db:migrate` e `dev`, entre na conta e abra `/garagem`. A seção Minha Garagem
do perfil usa os mesmos dados reais. Fotos JPEG/PNG/WebP de até 5 MB são
otimizadas e persistidas em `.local/motorcycle-photos`; o backend autoriza cada
leitura conforme a privacidade do perfil. `MOTORCYCLE_STORAGE_DIR` permite um
diretório privado absoluto alternativo. Consulte o [manual da Garagem](garagem.md)
e o [relatório da Parte 04](parte-04.md).

## Usar as contas da Parte 03

Com PostgreSQL disponível e `.env` configurado, execute na raiz:

```powershell
npx --yes pnpm@10.34.7 install --frozen-lockfile
npx --yes pnpm@10.34.7 db:migrate
npx --yes pnpm@10.34.7 dev
```

Abra <http://127.0.0.1:5173/cadastro>. Use a mesma origem definida em
`AUTH_WEB_ORIGIN`. Cadastro cria a conta real; depois entre em `/entrar`.
`/perfil`, `/configuracoes` e `/privacidade` exigem sessão válida. Cookies
HttpOnly preservam o login após recarregar; sair revoga a sessão no servidor.
Nenhum token de autenticação é salvo no localStorage.

`MAIL_MODE=test` usa um provedor em memória, testado automaticamente, e **não
envia e-mails externos**. Produção exige SMTP e textos jurídicos revisados.
Ver [manual de autenticação](autenticacao.md),
[relatório da Parte 03](parte-03.md) e [progresso](progresso.md).

```powershell
npx --yes pnpm@10.34.7 check
npx --yes pnpm@10.34.7 test:postgres
npx --yes pnpm@10.34.7 --filter @apex-ride/web test:e2e
```

`check` executa tipos, lint, formatação, testes sem dependências externas e
build. `test:postgres` executa autenticação, Garagem e sessões com PostgreSQL/PostGIS real;
sem `TEST_DATABASE_URL`, utiliza o banco definido no `.env`, criando um esquema
isolado temporário. `test:e2e` exige PostgreSQL e Chrome instalado, cria outro
esquema e diretório de fotos isolados por arquivo de teste, e inicia API/preview em 3002/5174. O banco precisa permitir
`CREATE SCHEMA`; nenhum usuário de testes é inserido no esquema da aplicação.
Execute o build antes de `test:e2e`.

Neste ambiente, Docker segue indisponível. Foi iniciado um cluster separado com
o PostgreSQL 17 instalado localmente, em `.local/postgres-auth/data`, loopback
55432, sem alterar o serviço PostgreSQL existente na porta 5432. Autenticação foi
validada nesse banco. Na Parte 06, PostGIS 3.6.2 foi habilitado após criar uma
cópia isolada do runtime PostgreSQL com suas bibliotecas em
`.local/postgres-runtime`. `db:check` passou pela API. Instruções atuais para
parar/reiniciar esse cluster com PostGIS em [Parte 06](parte-06.md).
Não execute Compose usando a mesma porta enquanto esse cluster estiver ativo.

## Visualizar a interface da Parte 02

```powershell
npx --yes pnpm@10.34.7 install --frozen-lockfile
npx --yes pnpm@10.34.7 dev:web
```

Abra <http://127.0.0.1:5173>. As prévias públicas funcionam sem banco, mas a identificação da sessão informa indisponibilidade quando a API está ausente.
Rotas: `/`, `/explorar`, `/ride`, `/comunidade`, `/perfil` e `/garagem`.
A página técnica da Parte 01 permanece em `/tecnico` e consulta a API real.

Para testar a interface no Chrome local, primeiro gere o build e depois execute:

```powershell
npx --yes pnpm@10.34.7 build
npx --yes pnpm@10.34.7 --filter @apex-ride/web test:e2e
```

O Playwright inicia o preview do build na porta 5174, testa sete larguras e
gera capturas em `.local/screenshots/`. Requer Google Chrome instalado; não baixa
navegador automaticamente. Ver [registro da Parte 02](parte-02.md).

## Requisitos

- Node.js **24.16.0 ou superior na linha 24 LTS**.
- pnpm **10.34.7**, fixado em `packageManager` e no lockfile.
- Docker Engine/Desktop com Docker Compose v2 e suporte a `up --wait`.
- Git.

Se pnpm não estiver instalado, use `npx --yes pnpm@10.34.7` no lugar de `pnpm`
em todos os comandos abaixo. Essa foi a forma usada para validar esta entrega,
sem instalar um gerenciador global. Dependências são fixadas e o
`pnpm-lock.yaml` deve ser versionado.

## Primeira execução (PowerShell)

Execute na raiz existente `D:\Projetos\ApexRide` (o monorepositório `apex-ride`;
não é necessário criar outra pasta dentro dela):

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Copie o exemplo somente se `.env` ainda não existir. Defina uma senha local em
`POSTGRES_PASSWORD` e a mesma senha em `DATABASE_URL`. A senha na URL deve usar
percent-encoding caso contenha caracteres reservados. Não publique `.env`.
Um `.env` local ignorado pelo Git já foi criado durante a implementação.

```powershell
pnpm db:up
pnpm dev
```

- Frontend visual: <http://127.0.0.1:5173>; diagnóstico em `/tecnico`.
- API: <http://127.0.0.1:3001/api/health>.
- Banco/PostGIS via API: <http://127.0.0.1:3001/api/health/db>.
- PostgreSQL local: `127.0.0.1:55432`, isolado de instalações locais na porta 5432.

`pnpm dev` inicia frontend e backend; o banco é iniciado separadamente com
`pnpm db:up`. Para terminais separados, use `pnpm dev:api` e `pnpm dev:web`.
Se alterar portas, ajuste também `DATABASE_URL`, `WEB_API_PROXY_TARGET` e
`CORS_ORIGINS` conforme o serviço alterado. As portas são estritas: os servidores
não escolhem uma porta diferente silenciosamente.

## Verificação

```powershell
pnpm check
pnpm db:check
Invoke-RestMethod http://127.0.0.1:3001/api/health
Invoke-RestMethod http://127.0.0.1:3001/api/health/db
```

`pnpm check` executa tipos, lint, formatação, testes e builds. A suíte padrão não exige serviços externos; os testes PostgreSQL e de navegador são executados separadamente pelos comandos acima.
`pnpm db:check` exige API e banco reais em execução e termina com código 1 se
PostgreSQL ou PostGIS não puderem ser confirmados. `API_BASE_URL` pode alterar o
endereço usado por esse comando.

Comandos individuais: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
`pnpm format`, `pnpm test`, `pnpm build`.

## Builds locais

```powershell
pnpm build
pnpm --filter @apex-ride/api start
```

O backend compilado fica em `apps/api/dist`; seu `.env` continua sendo lido da
raiz. O frontend fica em `apps/web/dist`. Para validar o build web com a API local,
configure **antes do build** `VITE_API_BASE_URL=http://127.0.0.1:3001/api` no `.env`,
adicione `http://127.0.0.1:4173` a `CORS_ORIGINS`, reinicie a API, gere o build e use:

```powershell
pnpm --filter @apex-ride/web preview
```

O proxy `/api` está configurado nos servidores Vite de desenvolvimento e preview local. O build web padrão usa
`/api`, exigindo uma API na mesma origem quando a infraestrutura futura for
definida. Nenhuma infraestrutura de produção foi criada nesta parte. Após o
preview, restaure os valores de desenvolvimento do `.env` se necessário.

## Banco: persistência e reinicialização

`compose.yaml` usa `postgis/postgis:17-3.6`, volume nomeado persistente e porta
publicada somente em loopback. O SQL em `database/init/` habilita PostGIS em
volume novo; o próprio pacote PostGIS pode criar metadados da extensão. As tabelas de conta foram adicionadas pela migração da Parte 03. A conta `POSTGRES_USER` é a conta administrativa
local do contêiner, usada para inicializar extensões; não é um modelo de permissões
de produção.

```powershell
docker compose ps
pnpm db:logs
docker compose restart database
pnpm db:down
```

`db:down` para os contêineres e preserva o volume. Na próxima execução,
`pnpm db:up` reutiliza os dados. Variáveis e SQL de inicialização não modificam
credenciais ou extensões de um volume já inicializado. Alterar a senha no `.env`
não altera a senha armazenada nesse volume.

Somente se quiser **descartar todos os dados locais**, execute manualmente
`docker compose down --volumes` e depois `pnpm db:up`. Esse reset destrutivo não
foi executado na entrega. Não use em um banco com dados que deseja preservar.
Migrações de conta ficam em `database/migrations/`. Após subir o banco, execute `pnpm db:migrate`.

## Encerramento

Use `Ctrl+C` no terminal de desenvolvimento para encerrar frontend e backend.
A API trata SIGINT/SIGTERM e fecha o pool; há limite de 10 segundos para shutdown.
Em seguida use `pnpm db:down` para encerrar o banco preservando os dados.

## Organização e variáveis

```text
apps/
  web/                 React, Vite e testes do frontend
    src/components/    layout, navegação, UI, telemetria, mapa e conteúdo social
    src/pages/         páginas visuais e diagnóstico técnico
    src/data/          dados locais de demonstração
    src/hooks/         consulta de saúde e ciclo de vida
    src/services/      cliente HTTP preservado
    src/styles/        tokens e estilos responsivos
    public/assets/     oito imagens ilustrativas locais em WebP
    e2e/               navegação, estados e responsividade no Chrome
  api/                 Fastify e testes da API
    src/config/        leitura e validação de ambiente
    src/modules/health/ endpoints técnicos
    src/database.ts    pool PostgreSQL e verificação do PostGIS
database/
  init/                inicialização da extensão
  migrations/          SQL versionado das contas e histórico de aplicação
docs/                  arquitetura e registro da entrega
scripts/               verificação real do banco através da API
```

As variáveis são documentadas em `.env.example`. Somente `VITE_` pode chegar ao
código do navegador; nunca coloque senhas nesse prefixo. `WEB_API_PROXY_TARGET`
é lida somente pela configuração de desenvolvimento. A API valida o ambiente
antes de escutar a porta e mantém variáveis externas com prioridade sobre `.env`.

`DATABASE_SSL=disable` só é aceito para `localhost`, `127.0.0.1` ou `::1`.
Para bancos remotos, use `verify-full`, que exige certificado confiável e valida
o servidor. Caso uma CA privada seja necessária no futuro, use o mecanismo
`NODE_EXTRA_CA_CERTS` do Node; não desative a validação. `DATABASE_URL` não aceita
query string ou fragmentos que poderiam sobrescrever opções seguras do pool.
CORS aceita apenas origens HTTP/HTTPS explícitas, sem curingas.

## Versões e estado da entrega

| Tecnologia                     | Versão definida        |
| ------------------------------ | ---------------------- |
| Node.js                        | 24.16.0 (linha 24 LTS) |
| pnpm                           | 10.34.7                |
| React / React DOM              | 19.3.1                 |
| TypeScript                     | 6.0.3                  |
| Vite / plugin React            | 8.3.5 / 6.1.2          |
| Fastify / CORS                 | 5.12.7 / 11.3.1        |
| Cookie / Nodemailer            | 11.1.3 / 10.2.0        |
| pg                             | 8.23.1                 |
| PostgreSQL / PostGIS (Compose) | 17 / 3.6               |
| ESLint / typescript-eslint     | 10.13.0 / 8.72.0       |
| Prettier                       | 3.9.10                 |
| Vitest / jsdom                 | 5.0.5 / 30.1.3         |
| tsx                            | 4.23.15                |

TypeScript 6.0.3 foi escolhido porque o `typescript-eslint` instalado suporta
TypeScript abaixo de 6.1. As dependências foram conferidas no registro npm, e
a compatibilidade de execução foi verificada pelas ferramentas de qualidade.
A imagem usa a linha estável 17/3.6, sem tags experimentais; patches dessa linha
podem ser atualizados pela imagem, diferentemente das dependências npm fixadas.

Veja [arquitetura](architecture.md) e o
[registro da Parte 01](parte-01.md) para resultados da fundação técnica.
O [registro da Parte 02](parte-02.md) descreve as telas, componentes,
dependências adicionadas, capturas e diferenças visuais restantes.
A Parte 06 também validou PostGIS real, salvamento de 50.000 pontos, idempotência
e autorização. Homologação em Android/iPhone físicos permanece pendente; veja o
[relatório da Parte 06](parte-06.md) para suas evidências. Sensores, resultados
atuais e limitações físicas estão no [relatório da Parte 07](parte-07.md).
