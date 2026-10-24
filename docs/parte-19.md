# Etapa 5 — Parte 19 de 23: grupos públicos e privados

Data: 23/10/2026. Implementação local, sem deploy. As migrações SQL 018, 019 e
020 pertencem exclusivamente à **Parte 19**; a numeração dos arquivos de banco
não representa avanço para a Parte 20 do produto.

## A. Funcionalidades implementadas

Comunidade oferece acesso a Grupos e Meus grupos. É possível criar grupos
públicos, privados descobríveis e privados não listados, revisar o formulário,
definir cidade/UF, interesses, regras, entrada e política de publicação. Avatar
e capa são opcionais e reutilizam o upload social. A criação usa uma chave
idempotente persistida por criador, inclusive após transferência de propriedade.

Descoberta, filtros, ordenações, páginas, detalhe, feed, regras, membros,
solicitações, convites recebidos/criados, administração, denúncias internas e
auditoria utilizam o PostgreSQL. Os dados de teste existem somente em esquemas
aleatórios removidos após as suítes. Nenhum grupo fictício foi inserido no banco
normal da aplicação.

Os blocos implementados são 19A (estrutura/descoberta), 19B (participação/cargos/
convites), 19C (publicações), 19D (gestão/segurança) e 19E (integração/validação).
As evidências de validação estão na seção N.

## B. Arquivos principais

| Área                | Arquivos                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Banco               | `database/migrations/018_groups.sql`, `019_group_indexes.sql`, `020_group_creation_identity.sql`                                                                           |
| Domínio             | `apps/api/src/modules/groups/policy.ts`, `validation.ts`, `store.ts`, `routes.ts`                                                                                          |
| Integração da API   | `apps/api/src/app.ts`, `modules/social/routes.ts`, `policy.ts`, `block-policy.ts`, `media.ts`                                                                              |
| Interface de grupos | `apps/web/src/groups/types.ts`, `GroupsPage.tsx`, `GroupForm.tsx`, `GroupDetailsPage.tsx`, `GroupManagement.tsx`, `styles/groups.css`                                      |
| Interface existente | `App.tsx`, `pages/CommunityPage.tsx`, `pages/AuthPage.tsx`, `components/ui.tsx`, `social/Composer.tsx`, `Feed.tsx`, `Profile.tsx`, `service.ts`, `types.ts`, `usePage.ts`  |
| Validação           | `apps/api/test/groups.postgres.test.ts`, `social.postgres.test.ts`, `postgres-runner.ts`, `apps/web/e2e/groups.spec.ts`, `interface.spec.ts`, `src/social/Social.test.tsx` |
| Documentação        | Este relatório, `docs/grupos.md`, `docs/progresso.md`, README e README de migrações                                                                                        |

## C. Banco de dados e integridade

`groups` contém UUID, slug estável, proprietário, criador original, chave de
criação, apresentação pública autorizada, privacidade/descoberta, políticas,
cidade/UF, array de interesses, regras JSONB versionadas, estado e contadores.

`group_memberships` centraliza tanto pedidos quanto participação; não há uma
segunda tabela com um estado concorrente de solicitação. Chave composta
`(group_id,user_id)`, cargo tipado e estados active/pending/rejected/cancelled/
removed/banned. Armazena data de entrada e versão das regras aceita.

`group_rules_versions` preserva cada conjunto de regras, versão, autor e data.
`group_invitations` guarda destinatário opcional, criador, SHA-256 do token,
expiração, limite/contador de usos e estado. `group_invitation_uses` impede
reutilização pela mesma conta, inclusive após saída ou recusa de um link.

`group_member_restrictions` registra suspensão, banimento/remoção, motivo,
responsável, timestamps e revogação. `group_moderation_actions` mantém a trilha
administrativa. Não existem endpoints para apagar ou reescrever essa trilha.

`social_posts` recebeu `group_id` opcional e `group_private` para manter o público
original do conteúdo. `social_post_media` recebeu grupo/slot para apresentação;
uma constraint impede associar a mesma foto simultaneamente a post e grupo.
`social_reports` recebeu alvos de grupo/membro, contexto e encaminhamento.
Posts, curtidas, comentários, fotos e denúncias continuam nas tabelas da Parte 18.

FKs, índice único parcial para um proprietário, FK composta diferível e triggers
de constraint verificam no commit que o grupo tem exatamente seu proprietário
ativo. Transferência rebaixa o antigo para administrador e promove o destinatário
na mesma transação. Triggers mantêm membros ativos, pedidos pendentes e posts
publicados; contadores não são aceitos do navegador.

Índices cobrem descoberta cronológica, nome/prefixo, busca textual em português
(GIN), UF/cidade, interesses (GIN), participação por usuário/grupo, restrições,
convites, feed por grupo, auditoria e denúncias. As migrações são aditivas,
transacionais e verificadas por checksum. Correções futuras devem acrescentar
migrações; não há rollback destrutivo automático.

## D. API e permissões

Todos os caminhos abaixo têm prefixo `/api`. Escritas exigem sessão ativa,
origem permitida, `X-Apex-Request` e CSRF. Leituras e arquivos usam `no-store`,
`Vary: Cookie`, política de referrer e respostas sem detalhes de conta.

| Método e caminho                                                       | Permissão/resultado                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET `/groups`                                                          | Apresentações elegíveis; filtros/paginação                                           |
| GET `/groups/mine`                                                     | Autenticado; próprias participações                                                  |
| GET `/groups/:id`, `/groups/:id/rules`                                 | Apresentação autorizada; não listado exige vínculo                                   |
| POST `/groups`                                                         | Autenticado; criação atômica/idempotente                                             |
| PATCH `/groups/:id`                                                    | Proprietário/admin; privacidade somente proprietário com confirmação                 |
| PATCH `/groups/:id/images`                                             | Proprietário/admin; fotos próprias válidas do upload social                          |
| POST `/groups/:id/join`                                                | Autenticado elegível, aceita versão atual das regras                                 |
| POST `/groups/:id/leave`                                               | Própria saída/cancelamento; proprietário transfere primeiro                          |
| POST `/groups/:id/accept-rules`                                        | Participante ativo, versão atual                                                     |
| GET `/groups/:id/members`                                              | Membros ativos; perfis e bloqueios limitam lista                                     |
| GET `/groups/:id/join-requests`                                        | Proprietário/admin                                                                   |
| POST `/groups/:id/join-requests/:userId/approve`, `/reject`            | Proprietário/admin; pedido deste grupo                                               |
| PATCH `/groups/:id/members/:userId/role`                               | Proprietário; admin/moderador/membro, nunca autopropriedade                          |
| DELETE `/groups/:id/members/:userId`                                   | Equipe, respeitando hierarquia; motivo obrigatório                                   |
| POST `/groups/:id/members/:userId/suspend`, `/ban`                     | Equipe, hierarquia, motivo e expiração para suspensão                                |
| DELETE `/groups/:id/members/:userId/suspend`, `/ban`                   | Equipe autorizada; revoga medida, não reinsere banido automaticamente                |
| POST `/groups/:id/transfer-ownership`                                  | Proprietário, confirmação, destinatário ativo sem suspensão                          |
| POST `/groups/:id/archive`, `/restore`                                 | Proprietário com confirmação                                                         |
| DELETE `/groups/:id`                                                   | Proprietário com confirmação; exclusão lógica                                        |
| POST/GET `/groups/:id/invitations`                                     | Equipe ou membros quando configurado; membro consulta somente os que criou           |
| DELETE `/groups/:id/invitations/:invitationId`                         | Equipe; membro pode revogar somente seu convite                                      |
| GET `/groups/invitations/mine`                                         | Destinatário autenticado; válidos e ainda disponíveis                                |
| POST `/groups/invitations/:invitationId/preview`, `/accept`, `/reject` | Destinatário ou portador autenticado do token; valida expiração/usos/grupo/bloqueios |
| GET `/groups/:id/posts`                                                | Público autorizado ou membro, conforme política/histórico                            |
| POST `/groups/:id/posts`                                               | Membro ativo, regras aceitas e política de publicação                                |
| POST `/groups/:id/moderate/posts/:contentId`, `/comments/:contentId`   | Equipe; ocultação com motivo e auditoria                                             |
| GET `/groups/:id/reports`                                              | Equipe; sem identidade do denunciante                                                |
| POST `/groups/:id/reports/:reportId/review`                            | Equipe; registra análise sem remover encaminhamento à plataforma                     |
| GET `/groups/:id/audit`                                                | Proprietário/admin; paginado                                                         |

Os endpoints existentes `/social/posts/:id`, edição/exclusão, `/like`, comentários,
`/social/media/:id` e `/social/reports` passaram a respeitar o contexto de grupo.
Denúncias aceitam também `kind=group` e `kind=group_member` com `groupId`.
Os feeds geral, Seguindo e perfil excluem posts associados a grupos.

## E. Públicos e privados

Públicos listados permitem consultar apresentação e posts públicos autorizados,
incluindo visitantes sem login. Publicar, curtir e comentar exigem participação.
Privados descobríveis exibem somente apresentação; contagem de membros fica
oculta de não membros. Privados não listados não aparecem na descoberta de
terceiros e nem por acesso direto ao UUID. Um convite válido mostra uma
apresentação limitada em endpoint autenticado; não retorna posts ou membros.

Banidos e contas bloqueadas pelo proprietário não recebem dados autenticados do
grupo. Um bloqueio entre dois outros participantes oculta conteúdo e interações
entre essas contas, sem expulsá-los automaticamente dos demais grupos.

## F. Criação e descoberta

Formulário usa os componentes e tokens Racing Tech existentes. Nome até 100,
descrição até 2.000, 20 regras de até 500 caracteres, cidade opcional até 100 e
UF brasileira válida. Categorias vêm de `BIKE_CATEGORIES` da Parte 14; não há
exigência de posse, cilindrada ou novo campo na Garagem.

Busca usa prefixo de nome e texto em português da apresentação. Há filtros por
UF/cidade exatas, interesse, público/privado, participação, gestão, propriedade e
solicitações/resultados. Ordenações: recentes, nome e número de membros visível.
Meus grupos inclui arquivados, sem reintroduzi-los na descoberta pública.

## G. Participação, pedidos e convites

Público com entrada imediata cria participação; privado ou público com aprovação
cria pedido. Reenvio não duplica registros. Aprovar/recusar valida estado pendente
e grupo correto; duas decisões simultâneas produzem somente um resultado válido.
Mudanças de política preservam pedidos para análise explícita, sem aprovação
automática. Saída encerra participação e revoga acesso privado nas próximas
requisições. Posts anteriores permanecem no grupo; autor pode excluir os próprios.

Convites têm até 30 dias e 1–100 usos (por perfil: um). Token de 32 bytes aleatórios,
somente hash no banco; o segredo aparece apenas na criação. O link web transporta
o token em fragmento `#token=`, e a API o recebe em corpo POST. Não vai para logs
de URL ou query string. Uso exige sessão e aceitação das regras. Convite de
proprietário/admin substitui aprovação prévia; convite de membro continua sujeito
à aprovação exigida pelo grupo. A permissão atual do convidador é revalidada ao
aceitar, além de banimentos, suspensão, bloqueios, expiração e limite.

## H. Cargos e matriz central

`groups/policy.ts` concentra a matriz tipada, participação ativa, estado do grupo,
suspensão, regras, políticas de postagem/convite e hierarquia.

| Ação                                  | Proprietário             | Admin            | Moderador        | Membro            |
| ------------------------------------- | ------------------------ | ---------------- | ---------------- | ----------------- |
| Editar informações/regras/imagens     | Sim                      | Sim              | Não              | Não               |
| Alterar privacidade/descoberta        | Sim                      | Não              | Não              | Não               |
| Aprovar/recusar pedidos               | Sim                      | Sim              | Não              | Não               |
| Convidar                              | Sim                      | Sim              | Se membros podem | Se configurado    |
| Publicar/interagir                    | Sim                      | Sim              | Sim              | Conforme política |
| Ocultar conteúdo/analisar denúncias   | Sim                      | Sim              | Sim              | Não               |
| Remover/suspender/banir               | Cargos inferiores        | Moderador/membro | Membro           | Não               |
| Promover/rebaixar                     | Sim, exceto proprietário | Não              | Não              | Não               |
| Transferir/arquivar/restaurar/excluir | Sim                      | Não              | Não              | Não               |
| Consultar auditoria                   | Sim                      | Sim              | Não              | Não               |

Suspensos podem consultar conteúdo para o qual continuam autorizados, mas não
ganham permissões de interação ou administrativas. Banimento retira acesso de
membro e impede reentrada. Revogação de cargo vale na próxima operação; o token
da sessão não contém autoridade administrativa de grupo.

## I. Publicações e reutilização da Parte 18

O mesmo compositor, `Feed`, `LivePost`, serviço social, upload, curtidas,
comentários, paginação e denúncias atendem os grupos. Somente o destino muda.
Não foram criadas cópias de posts nem tabelas paralelas de interações.
Posts do grupo ficam fora do feed geral/Seguindo/perfil. Publicação exige regras
atualizadas; a opção `staff` restringe novas publicações à equipe. Moderar oculta
conteúdo com motivo; não reescreve silenciosamente texto de terceiros.

## J. Garagem, Histórico e perfil

O compositor valida propriedade e estado ativo da moto no servidor. Mantém a
política conservadora da Parte 18: associação não libera a Garagem privada.
O compartilhamento no Histórico continua abrindo o compositor sem publicar;
agora é possível escolher um grupo paginado do qual participa em **Destino**.

Somente Ride próprio, sincronizado e público é elegível à política atual de
resumo. Modo, dia, distância e duração são calculados no servidor; nenhum GPS,
telemetria técnica, vídeo local ou endereço acompanha o post. Se Ride/perfil
deixar de permitir o resumo, a leitura posterior devolve `ride: null`.
Um Ride privado não se torna público por entrar em grupo, salvar ou sincronizar.

O perfil oferece participações públicas autorizadas. Na própria conta é possível
consultar privados em Meus grupos; terceiros não recebem essa lista. Seguidores
não se tornam membros e convites não criam chat.

## K. Moderação, denúncias e auditoria

Remover encerra vínculo; banir impede retorno; suspender bloqueia interações até
expiração ou revogação. Datas são avaliadas pelo PostgreSQL, sem temporizador
obrigatório no cliente. A hierarquia protege cargos iguais/superiores e o
proprietário. Medidas exigem motivo e registram responsável/data/alvo.

Denúncias reutilizam a Parte 18 e são limitadas por conta/minuto e unicidade do
alvo. Todas permanecem encaminhadas à plataforma, inclusive contra o dono.
A equipe recebe uma visão sem identificador do denunciante; **Registrar análise**
acrescenta auditoria e não apaga nem encerra o registro técnico da plataforma.
Não há exclusão automática de conteúdo por denúncia nem painel global da Parte 22.

## L. Privacidade, mídia, cache e transações

A condição SQL central de acesso se aplica também a URL direta de post,
comentários e arquivos. O autor não recebe um bypass de participação em post
privado de grupo. A política individual de perfil permanece conservadora:
perfil privado exige o próprio autor ou seguidor aprovado, além da autorização
do grupo. A lista de membros omite perfis privados de leitores comuns;
proprietário/admin recebem nomes públicos mínimos necessários para gerir pedidos.

Público → privado bloqueia imediatamente leituras públicas e marca conteúdo
histórico como restrito. Privado → público mantém essa marca nos posts antigos;
editar um post não remove a proteção. Uma divulgação nova exige criar outra
publicação conscientemente.

Fotos usam o armazenamento social privado existente: JPEG/PNG/WebP reais,
limite de 5 MiB, decodificação segura, WebP redimensionado, miniatura e remoção
de EXIF. Não há SVG ativo, upload de vídeos nem diretório estático público.
Capa/avatar não listado também exigem vínculo autorizado; a prévia do convite
mostra apenas os dados textuais necessários, sem liberar seus arquivos.

Regras de cache são privadas/no-store. Conteúdo de grupos não é gravado no
IndexedDB nem no service worker. Paginação limpa dados após erro de acesso e
separa estado por identidade; foco reconsulta o backend. Não há mecanismo de
push para apagar bytes já entregues a um navegador; a revogação bloqueia as
próximas requisições. Trocar de conta desmonta os detalhes privados.

Operações bloqueiam contas em ordem canônica e usam advisory lock por grupo.
Usos de convite, decisões de pedido, cargo, transferência e contadores são
atômicos. Upload/anexação/limpeza seguem o lock social já existente; reenvio da
mesma capa é idempotente. O proprietário não pode sair sem transferência.
Exclusão de grupo é lógica: conteúdo e arquivos ficam inacessíveis, mas auditoria,
denúncias e associações permanecem retidos. Não apaga Ride, moto ou perfil.

## M. Performance e limites operacionais

Páginas padrão de 20, máximo 50; cursor cronológico compartilhado da Parte 18
para feed, grupos recentes, membros, solicitações, convites, auditoria e denúncias.
Nome/membros usam paginação estável por ordenação/UUID com offset limitado a
10.000, transportado no cursor. Essas duas ordenações podem variar entre páginas
sob inserções/alterações concorrentes; recentes usa cursor de posição real.

Contadores de membros/pedidos/posts são persistidos por triggers transacionais.
Não há contagem global no navegador, N+1 HTTP para cards ou carregamento de todas
as fotos/comentários/membros. Consultas têm limites e filtros no servidor, índices
de acesso e imagens lazy. O feed público exclui `group_id` explicitamente.

Rate limits PostgreSQL compartilhados: leitura de grupos 180/min; criação 5/min;
operações de convite 20/min; demais escritas de grupo 60/min. Publicações,
comentários, mídia e denúncias usam também os limites sociais da Parte 18.

## N. Testes executados

| Verificação              | Resultado efetivamente obtido                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`             | TypeScript, lint, formatação, 586 testes padrão e builds aprovados                                                 |
| PostgreSQL/PostGIS       | 261 cenários aprovados em nove arquivos, com um worker; 55 são da Parte 19                                         |
| Chrome                   | 64 cenários distintos validados entre a regressão completa e a repetição final de Grupos/Interface                 |
| Grupos no Chrome         | Três fluxos com banco real: texto/foto/moto/interações/offline, privado com gestão/revogação e convite não listado |
| Responsividade           | Detalhes do grupo em 320/360/375/390/430/1440 px, sem overflow; criação, descoberta, convites e gestão capturados  |
| Aparelhos físicos/Safari | Não executados; roteiro preparado                                                                                  |

Total: **911 cenários distintos**, incluindo 60 novos (55 PostgreSQL, dois de
interface unitária e três de navegador). Os testes PostgreSQL são excluídos
da suíte padrão e foram executados separadamente, não contados duas vezes.

A primeira rodada encontrou um mock social que ainda não atendia a consulta de
grupos do compositor, a expectativa de índice do feed anterior, um timeout de
autenticação sob execução simultânea e a asserção Chrome da antiga mensagem de
grupos futuros. O mock/contratos foram atualizados para o comportamento real e
o banco repetido isoladamente: nove arquivos/261 cenários aprovados. No navegador,
63 cenários passaram na rodada completa; Grupos (três) e Interface (11) passaram
novamente no build final, incluindo o cenário que ainda esperava a mensagem antiga.

Os testes de banco cobrem criação/validação/idempotência após transferência,
descoberta e paginação, pedidos concorrentes, convites limitados/reutilização,
cargos, propriedade, posts/fotos/motos/Rides, hierarquia, bloqueios, suspensão,
regras, contadores, denúncias, mídia não listada, exclusão lógica e cache.
A aprovação também revalida bloqueio com o proprietário, mesmo se outro admin
estiver analisando o pedido. A suíte de grupos foi repetida após essa verificação.

Logs locais: `.local/parte19-check-final.log`, `parte19-postgres-final.log`,
`parte19-groups-final.log`, `parte19-browser-regression.log`,
`parte19-browser-final.log` e `parte19-interface-final.log`. Capturas em
`.local/screenshots/groups-*.png`, inspecionadas visualmente. Esses diretórios
são evidências locais ignoradas pelo Git. Não houve teste manual em Android ou iPhone.

## O. Limitações e pendências

- Android/iPhone físicos e Safari não homologados neste ambiente; roteiro em
  [grupos.md](grupos.md). Chrome com viewport móvel não equivale a esses aparelhos.
- Sem publicação social offline; rascunho permanece na tela após falha de rede,
  sem promessa de persistência após fechar/recarregar o navegador.
- Privacidade de perfil e Ride segue a política conservadora da Parte 18;
  não há novo consentimento para compartilhar resumo de Ride privado nesta parte.
- Regras usam edição ordenada por linhas; mudança de conteúdo exige nova aceitação
  antes de interagir, sem expulsão automática. Não existe editor visual arrastável.
- Exclusão de grupo é lógica; expurgo físico por prazo de retenção e tratamento
  administrativo de proprietário com conta desativada ficam para política posterior.
- Não há teste de carga de toda a população brasileira nem medição de memória em
  aparelhos físicos. Índices, limites e contadores foram implementados; resultados
  sintéticos não são apresentados como dimensionamento de produção.
- Sem envio externo automático de convites, recuperação do segredo armazenado,
  chat ou notificações push. O link deve ser compartilhado por ação da pessoa.
- O build mantém o aviso preexistente de chunk grande de mapa/GPS.

## P. Preparação para a Parte 20

UUIDs estáveis de grupo, participação, cargos e autorização central poderão ser
referenciados futuramente por eventos/passeios e atividades coletivas. Uma futura
integração deve revalidar participação e introduzir consentimento separado para
localização voluntária, temporária e desativada por padrão. Não foram criados
eventos, encontros, mapa social, localização ao vivo, XP, rankings, conquistas,
mensagens privadas ou painel global de moderação nesta entrega.
