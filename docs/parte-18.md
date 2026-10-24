# Etapa 5 — Parte 18 de 23

Data: 23/10/2026. Escopo exclusivo: Comunidade, feed, publicações, fotografias,
curtidas, comentários, perfis, seguidores, solicitações, bloqueios, denúncias e
compartilhamento seguro de atividades. Sem deploy nem implementação da Parte 19.

## A. Funcionalidades implementadas

A página aprovada usa publicações reais. O cabeçalho, hero, identidade Racing
Tech, cards, tokens, tipografia, cinco abas e botão central Ride foram mantidos.
Os módulos anteriores foram reutilizados; a prévia social do Início também usa
dados reais. Posts/grupos/rankings demonstrativos deixaram de preencher as áreas
sociais em produção. As seções futuras continuam identificadas como indisponíveis.

Foram conectados criação/prévia/edição/exclusão, fotos, moto própria, Ride
autorizado, feed público e Seguindo, comentários paginados e exclusão própria,
curtidas, busca por prefixo, perfis sociais, seguidores/seguindo, pedidos e
decisões, remoção de seguidor, bloqueio/desbloqueio e denúncias básicas.
Estados de carregamento, vazio, fim, falha e conteúdo removido são explícitos.

## B. Arquivos principais

- `database/migrations/017_social.sql`: modelo e índices.
- `apps/api/src/modules/social/{routes,policy,validation,media}.ts`: APIs,
  autorização central, contratos, processamento e limpeza de mídia.
- `apps/api/src/app.ts`: registro do módulo e mensagens/Retry-After sociais.
- `apps/api/src/modules/{auth,motorcycles}/routes.ts` e `rides/public.ts`:
  integração de bloqueios nos acessos públicos anteriores; privacidade serializada.
- `apps/web/src/social/{Feed,Composer,Profile,CommunityPreview}.tsx`, `types.ts`, `service.ts` e
  `usePage.ts`: experiência social e paginação com cancelamento de respostas antigas.
- `apps/web/src/styles/social.css`: estilos complementares com os tokens existentes.
- `apps/web/src/{App,pages/CommunityPage,pages/HomePage,pages/RideDetailsPage}.tsx`:
  rotas, cards reais e acesso explícito pelo Histórico.
- `apps/api/test/social.postgres.test.ts`, `apps/web/src/social/Social.test.tsx`
  e `apps/web/e2e/social.spec.ts`: autorização, mídia, UI, concorrência e navegação.
- `apps/api/test/{postgres-runner,browser-runner}.ts`: inclusão da suíte social
  e limpeza do subdiretório isolado de fotos. Quatro fixtures PostgreSQL anteriores
  incluem tabelas sociais dependentes no TRUNCATE de seus esquemas temporários.
- `apps/web/e2e/interface.spec.ts`: contrato antigo de comentários demonstrativos
  substituído por feed real vazio e autenticação necessária para interação.
- README, `.env.example`, manual, registro das migrações e controle de progresso.

## C. Banco de dados

Migração aditiva `017_social.sql`, aplicada localmente por `db:migrate`.
Tabelas: `social_posts`, `social_post_media`, `social_media_cleanup`,
`social_post_likes`, `social_post_comments`, `social_follows`, `social_blocks`,
`social_reports`. FKs usam contas, motocicletas e atividades existentes.

Há índices cronológicos parciais de posts, autor, comentários; índices nos dois
sentidos das relações e bloqueios; mídia por post e uploads pendentes; fila de
limpeza; denúncias pendentes; nomes/usuários/cidades por prefixo. Likes têm chave
post/conta, follows têm chave seguidor/seguido, reports têm unicidade por alvo
e denunciante. Checks impedem autorrelacionamentos, públicos/estados inválidos e
denúncias com múltiplos alvos. Contadores são agregados autoritativos no SQL.

## D. API

Prefixo `/api/social`. Implementados:

| Recurso          | Endpoints                                                                           |
| ---------------- | ----------------------------------------------------------------------------------- |
| Feed             | `GET /feed`, `GET /feed/following`                                                  |
| Posts            | `POST /posts`, `GET/PATCH/DELETE /posts/:id`                                        |
| Curtidas         | `POST/DELETE /posts/:id/like`                                                       |
| Comentários      | `GET/POST /posts/:id/comments`, `DELETE /comments/:id`                              |
| Perfis           | `GET /users/search`, `/users/:username`, `/users/:username/posts`                   |
| Relações         | `POST/DELETE /users/:id/follow`, `GET /users/:id/followers`, `/users/:id/following` |
| Pedidos          | `GET /requests`, `POST /requests/:id/approve`, `DELETE /requests/:id`               |
| Remover seguidor | `DELETE /followers/:id`                                                             |
| Bloqueios        | `POST/DELETE /blocks/:id`, `GET /blocks`                                            |
| Denúncias        | `POST /reports`                                                                     |
| Fotos            | `POST /media`, `GET/DELETE /media/:id`, miniatura `?size=thumb`                     |
| Ride             | `GET /rides/:id/preview`                                                            |

Contratos, limites, motivos e exemplos de payload estão no [manual](comunidade.md).
Escritas exigem sessão, origem e CSRF anteriores. Dados privados são validados
no servidor, incluindo por URL/ID direto. Todas as respostas sociais são no-store.

## E. Feed

O feed geral contém apenas posts públicos de perfis públicos elegíveis. Seguindo
faz a seleção no banco usando somente relações aprovadas. O perfil próprio
também permite consultar seus posts privados/para seguidores. Não há algoritmo
de recomendação ou carga de todo o grafo no frontend.

Cursor opaco por data + UUID, ordenação decrescente, padrão 20/máximo 50, botão
Carregar mais, deduplicação por ID e cancelamento de requisição anterior. Busca
preserva microssegundos das contas antigas; registros sociais têm precisão de
milissegundo. Atualizar/retomar foco consulta novamente sem eliminar o texto do
compositor em curso. O fim e os feeds vazios não recebem dados inventados.

## F. Publicações e fotos

Um modelo central combina texto de até 2.000 caracteres, cinco fotos, referência
opcional à moto e ao Ride. Servidor valida propriedade, conteúdo e todos os anexos
na transação. PATCH aceita o estado editável completo; não permite trocar autor.
Exclusão lógica preserva moto/Ride e fila durável remove os arquivos sociais.

Uploads explícitos usam JPEG/PNG/WebP até 5 MiB, validação de assinatura e decoder,
limite de 40 MP, rejeição de animação/conteúdo ativo, orientação normalizada,
WebP até 1.600 px e miniatura 480 px. Metadados EXIF/GPS/XMP são removidos.
O volume privado anterior é reutilizado em `MOTORCYCLE_STORAGE_DIR/social`.
PostgreSQL não guarda imagens nem Base64. Acesso às fotos revalida o post.
Uploads abandonados expiram em uma hora; limpeza roda por minuto com retentativa.

## G. Curtidas e comentários

Curtidas/descurtidas são idempotentes por constraint e só atualizam UI depois
da confirmação do servidor. Transações com locks ordenados de contas impedem
corridas com bloqueio. Contagens consultam relações persistidas e filtram contas
inativas/bloqueadas. Comentários simples têm limite de 1.000 caracteres, paginação,
propriedade para excluir e renderização textual segura. Não existe HTML executável.

## H. Seguidores

Perfil público aprova o seguimento; privado registra `pending`. Só `approved`
concede acesso social. Aprovar/recusar, cancelar pedido, deixar de seguir e
remover seguidor são ações distintas. Listas e contagens restritas não aparecem
para visitantes sem autorização. Busca não expõe e-mail, telefone, residência
ou localização derivada de GPS. Identificador público usa o username existente.

## I. Compartilhamento de Rides

Histórico → Compartilhar na Comunidade prepara o compositor sem publicar nem
alterar a visibilidade. Ride precisa ser próprio, sincronizado, público e não
excluído. A prévia exige perfil público, mantendo a política conservadora da
Parte 12. O usuário confirma legenda, público e Publicar.

Servidor produz modo, dia, distância arredondada e minutos ativos; não envia
mapa, pontos GPS, endereços, horários ponto a ponto, velocidades/eventos ou séries
técnicas de terceiros. Sem cópia de resumo no post: alteração de visibilidade
ou exclusão da atividade suprime a referência na próxima consulta. Texto e fotos
autorizados podem permanecer. Nenhum vídeo local é enviado ao backend.

## J. Privacidade

Política combina conta ativa, estado do conteúdo, autor, público, perfil,
seguimento aprovado e bloqueios bilaterais. Perfil privado restringe inclusive
post marcado público. Somente eu permite apenas dono. Acesso direto a mídia usa
a mesma política; links não contornam cookies ou permissões. APIs usam no-store,
Vary Cookie, nosniff e CORP. Seguir não libera Histórico, Replay ou GPS privados.

## K. Denúncias e bloqueios

Bloqueio remove relações/pedidos nos dois sentidos e impede leitura/interação
autenticada nos endpoints sociais e nos acessos públicos anteriores integrados.
Comentários/curtidas antigos de bloqueados ficam fora da visão do visualizador.
Desbloquear não restaura relações. Denúncia autenticada de post/comentário/perfil
usa motivo, detalhes opcionais, unicidade e rate limit; não expõe denunciante
nem remove conteúdo automaticamente. Sem painel administrativo nesta etapa.

## L. Performance

Páginas limitadas, consultas indexadas, agregação de anexos/contadores na consulta
do feed, sem HTTP ou query por card, imagens otimizadas com srcset e lazy loading,
limite de pixels/tamanho e dois processamentos simultâneos por processo.
Teste sintético isolado com 2.000 posts verifica consulta limitada e índice
cronológico. Advisory lock de mídia coordena apenas associação/expurgo, sem
incluir processamento Sharp. Limites distribuídos usam o PostgreSQL existente.

## M. Validação

Resultados executados em 23/10/2026: **851 cenários distintos aprovados**.

| Verificação             | Resultado                                                                         |
| ----------------------- | --------------------------------------------------------------------------------- |
| `pnpm check`            | TypeScript, lint, formatação, testes padrão e builds aprovados                    |
| Suíte padrão            | 584: 191 API + 393 web                                                            |
| PostgreSQL/PostGIS real | 206 em oito arquivos, repetição isolada com `--maxWorkers=1`                      |
| Social PostgreSQL final | 46 aprovados, incluindo a última revisão da política anônima                      |
| Chrome                  | 61 distintos aprovados, considerando execução completa e reexecuções direcionadas |
| Migração local          | `017_social.sql` aplicada por `db:migrate`                                        |
| Responsividade          | 320/360/375/390/430/1440 px sociais; interface também em 768 px                   |

São 55 novos cenários: seis testes web, 46 PostgreSQL e três fluxos Chrome.
Os testes padrão não executam os 206 casos PostgreSQL sem a conexão de testes;
esses foram efetivamente executados pelo runner separado, em esquemas isolados.

A rodada completa Chrome aprovou 60 casos e encontrou um contrato antigo que
esperava comentários fictícios. Esse teste foi atualizado para a Comunidade real
vazia e a exigência de autenticação. No build final, foram repetidos e aprovados
os 11 casos de interface, três sociais e quatro do Histórico. As duas primeiras
execuções do novo roteiro social também identificaram ambiguidades em rótulos;
nomes acessíveis explícitos corrigiram a seleção de campos preenchidos/seletores.

Uma execução simultânea de PostgreSQL e navegador teve 21 falhas, incluindo
timeouts de hooks. A suíte completa foi repetida isoladamente com um worker:
206 aprovados em 154,37 s. A revisão final da política social recebeu ainda
reexecução direcionada dos 46 casos, todos aprovados. Nenhum timeout foi ampliado
para ocultar falhas. O build preserva o aviso de tamanho do chunk MapLibre.

Foram inspecionadas capturas de feed móvel/desktop, compositor, comentários e
perfil privado/aprovado em `.local/screenshots/social-*.png`. Os testes cobrem
duas contas, pedidos, remoção/revogação, bloqueios por ID, fotos privadas,
EXIF, miniaturas, arquivos inválidos/grandes, falha/limpeza de storage, corrida
de curtidas, paginação com datas iguais/inserções/exclusões, erro de rede com
texto preservado, texto escapado e ausência de publicação automática de Ride/vídeo.
O teste de carga usa 2.000 posts sintéticos somente no esquema temporário.
Nenhum resultado Android/iPhone físico ou Safari foi presumido.

## N. Limitações

Android/iPhone físicos, Safari, teclado e compartilhamento nativo exigem o
[roteiro de homologação](comunidade.md). Avatar continua placeholder porque o
upload de avatar não existia na Parte 03. Sem persistência de rascunho após fechar
a página, fila social offline, respostas aninhadas, edição de comentário ou
controle visual de reordenação de fotos (API permite reordenar).

Busca é por prefixo; mapa de Ride é omitido por privacidade. Armazenamento local
exige volume persistente e dimensionamento/monitoramento da limpeza. Retenção
de denúncias e expurgo de exclusões lógicas precisam de política operacional.
O build mantém o aviso anterior de chunk MapLibre grande. Conteúdo já visto ou
copiado externamente não pode ser recolhido pelo bloqueio.

## O. Preparação para a Parte 19

Perfis existentes, posts centrais, anexos privados, relações aprovadas, estados,
paginação e política de autorização podem servir de base para grupos futuros.
Grupos públicos/privados precisarão de entidades de associação e permissões
próprias. Nenhum grupo, chat, evento, mapa social, gamificação, XP, ranking
funcional ou painel completo de moderação foi implementado.
