# Funcionalidades solicitadas que ainda exigem mudanças de backend

Este documento separa trabalho visual entregue das operações de dados ainda NÃO implementadas.

## 1. Excluir definitivamente percursos

Hoje `DELETE /api/routes/:id` apenas ajusta `status='archived'` em `apps/api/src/modules/routes/mutations.ts`. Para exclusão definitiva, é necessário mapear FKs/referências em atividades, voltas, favoritos, versões, eventos e comparações; definir se a exclusão retém um snapshot histórico ou se é bloqueada quando há registros dependentes; remover dados privados associados em transação, com autenticação/prova de titularidade; e atualizar UI/serviço de rotas para nova ação explícita com confirmação.

## 2. Moto da Garagem

Hoje `DELETE /api/motorcycles/:id` altera `archived_at`. Dados de motos estão relacionados a rides, fotos, serviços, documentos e histórico de identidade. A exclusão definitiva precisa de política de dependências, preservação de atividades históricas quando aplicável, exclusão de mídias e registro de auditoria apropriado.

## 3. Postagens e comentários

Já existe exclusão pelo proprietário na UI e rotas `DELETE /api/social/posts/:id` e `DELETE /api/social/comments/:id`, mas o banco usa estados `deleted` para manter integridade de denúncias/moderação. Exclusão física e retenção precisam ser tratadas separadamente, com política específica para mídias, denúncias e backups; não alterar ingenuamente `DELETE` em tabela de posts.

## 4. Publicação pelo dono da rota (sem autorização de administrador)

Hoje `POST /api/routes/:id/submit` envia a rota para `pending`, e apenas a moderação pode aprovar `approved`. Para substituir essa regra por privado / público / seguidores / grupo:

1. Adicionar coluna controlada de audiência em `routes` (ex.: `visibility`) e, para grupo, `group_id` opcional com FK e autorização no momento de publicar.
2. Separar `status` de edição/validação (`draft`, etc.) e `visibility` de audiência, sem permitir que `approved` signifique 'visível para todos' por acidente.
3. Revisar TODOS os endpoints de listagem/detalhes/favoritos/compartilhamento/GPX para reforçar ACL no servidor: dono, seguidores aceitos, integrantes do grupo e usuários bloqueados; não basta ocultar opções no React.
4. Revogar acesso ao deixar grupo, deixar de seguir, bloquear usuário ou tornar rota privada, incluindo caches, URLs e compartilhamentos.
5. Proteger pontos sensíveis de saída/chegada conforme preferências do proprietário e manter regras específicas de circuitos/locais fechados.
6. Testar visibilidade cruzada com diferentes usuários, sessão anônima e alterações concorrentes.

**Nenhuma das quatro modalidades deve ser anunciada como ativa antes dessas validações.**

## 5. Ranking

A nova interface filtra por Brasil, UF, cidade, categorias e cilindrada usando os parâmetros já suportados. O backend preserva `opted_in` e visibilidade privada. Como a UI longa de preferências foi removida, é necessário realocar adesão e escolhas de privacidade para as Configurações/Perfil antes de considerar que novos participantes podem entrar no ranking.

## Prioridade sugerida

1. Configurar MapTiler e OSRM no `.env` (resolve os 503 sem alterar banco).
2. Validar o ZIP visual nos breakpoints e fluxos de login.
3. Implementar publicação por audiência e ACL end-to-end com migração e testes.
4. Implementar exclusão definitiva com política de FKs/mídias/backups e UI de confirmação.
5. Revisar controles de consentimento do ranking sem inclusão compulsória.
