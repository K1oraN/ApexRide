# Comunidade — Parte 18

Esta entrega conecta a composição Racing Tech existente a dados reais. Feed
geral cronológico, feed Seguindo, perfis sociais, busca, seguidores e solicitações
usam a autenticação por cookie e CSRF da Parte 03. Não há dados sociais fictícios
inseridos no banco. As cinco abas e o painel Ride foram preservados.

## Uso

Execute `npx --yes pnpm@10.34.7 db:migrate` e inicie API/web normalmente.
Abra `/comunidade`, entre e escolha **Criar publicação**. Escreva, escolha fotos,
moto e/ou Ride opcional, público, confira a prévia e confirme **Publicar**.
O público inicial é Seguidores autorizados; posts restritos e Somente eu podem
ser consultados em **Meu perfil social**, além dos feeds em que forem elegíveis.
Selecionar atividade ou fotografia nunca publica automaticamente.

O menu do card permite editar/excluir posts próprios ou denunciar conteúdo de
terceiros. Exclusão de publicação exige confirmação e preserva moto e atividade.
Curtidas só mudam após a resposta da API. Comentários são texto simples, têm
1.000 caracteres e exclusão pelo próprio autor. Nenhum HTML é interpretado.

Busque nome, usuário ou região geral pela inicial do campo (busca por prefixo).
Abra `/comunidade/u/:username` para seguir, consultar publicações e listas.
Perfil privado recebe solicitação; **Solicitações recebidas** permite aprovar ou
recusar. O solicitante pode cancelar. O proprietário pode remover seguidores.
**Contas bloqueadas** permite desfazer bloqueios. Desbloquear não restaura relações.

## Modelo e migração

`database/migrations/017_social.sql` é aditiva e não duplica usuários, motos ou GPS.

| Tabela                 | Finalidade                                                      |
| ---------------------- | --------------------------------------------------------------- |
| `social_posts`         | Texto, público, autor, referências opcionais e estado           |
| `social_post_media`    | Arquivos WebP privados, miniatura, dimensões e ordem            |
| `social_media_cleanup` | Diário durável de remoção e uploads interrompidos               |
| `social_post_likes`    | Chave primária publicação + conta                               |
| `social_post_comments` | Texto simples, autor, estado e publicação                       |
| `social_follows`       | Chave seguidor + seguido, pending/approved                      |
| `social_blocks`        | Par bloqueador + bloqueado                                      |
| `social_reports`       | Referência por FK a post, comentário ou perfil; motivo e estado |

Posts combinam texto e anexos num único modelo; texto, fotos, motocicleta e Ride
não são sistemas separados. O tipo é derivado dos anexos presentes. Não há
cópia imutável de métricas, dados privados da Garagem ou geometria GPS no post.
O servidor valida conteúdo não vazio, propriedade e elegibilidade antes do COMMIT.

Índices cobrem feeds público/autor, relações em ambas as direções, bloqueios
reversos, comentários por post/data/ID, mídia por post, uploads expirados e
denúncias pendentes. Nomes/usuários/cidades possuem índices por prefixo.
Denúncia tem unicidade por denunciante e alvo. Curtidas e relações têm unicidade
no banco, inclusive com requisições concorrentes.

Contadores são agregados SQL, sem valores materializados ou fornecidos pelo
cliente. Contas inativas e bloqueadas são filtradas das contagens apresentadas.
Posts/comentários usam exclusão lógica. Fotos removidas entram na limpeza física.
Denúncias conservam FKs após exclusão lógica, sem divulgar quem denunciou.

## Fotos e armazenamento

Limites centralizados em `modules/social/validation.ts`: texto 2.000 caracteres,
comentário 1.000, cinco fotos, 5 MiB por arquivo, páginas padrão 20/máximo 50.
O processador existente da Garagem valida assinatura real e decodificação
JPEG/PNG/WebP, até 40 megapixels, sem imagens animadas. SVG, HEIC, vídeo e URLs
remotas não são aceitos. Não há download de URL arbitrária no servidor.

Sharp aplica orientação, remove EXIF/GPS/XMP/ICC, reencoda WebP até 1.600 px,
qualidade 82; miniatura até 480 px, qualidade 75. Até dois processamentos sociais
simultâneos por processo; excesso retorna 429 para retentativa explícita.

A abstração `PhotoStorage` já existente é reutilizada. A implementação local usa
o subdiretório **social** de `MOTORCYCLE_STORAGE_DIR`, por padrão
`.local/motorcycle-photos/social`. Configure um volume privado persistente para
API em operação; não publique esse diretório por servidor estático. PostgreSQL
guarda somente referências e metadados. Um adaptador de objetos pode implementar
a mesma interface; não foi provisionado S3/CDN nesta etapa.

Uploads recebem IDs aleatórios e dois registros de limpeza antes de qualquer
escrita. O post só fica visível depois da associação transacional de todos os
anexos válidos. Fotos pendentes são acessíveis apenas ao dono por até uma hora.
Falhas preservam o texto e os uploads já confirmados no compositor para retentar.
Cancelar ou fechar pode deixar uploads pendentes, expurgados depois de uma hora.

O coletor roda na inicialização e a cada minuto, com lotes de 50 arquivos,
transações, locks, retentativa em cinco minutos e verificação de referências.
Mídia confirmada é preservada. Um advisory lock curto coordena associação,
reordenação e expurgo de mídia entre processos; a transformação Sharp fica fora
dele. Backlog grande exige dimensionamento e monitoramento operacionais.

Leituras de mídia passam por `/api/social/media/:id` e repetem a política de
acesso ao post. Não existem links de objeto públicos permanentes. Respostas
incluem `private, no-store`, `Vary: Cookie`, `nosniff` e CORP same-site. Abrir foto
maior em outra aba continua exigindo autorização na API.

## Privacidade e Rides

O servidor combina perfil, público do post, seguimento aprovado, bloqueios,
estado da conta e estado do conteúdo. Perfil privado limita inclusive posts
marcados como públicos. Post Seguidores exige aprovação; Somente eu exige o
autor. Pendência nunca concede acesso. Listas e biografia de perfil privado
ficam restritas; descoberta revela apenas identidade pública mínima.

Bloqueios são bilaterais para leitura e interação autenticadas, removem relações
e pedidos nos dois sentidos e são conferidos por IDs diretos. Os endpoints
anteriores de perfil, Garagem e resumo público também verificam bloqueios.
Transações sociais bloqueiam contas envolvidas em ordem determinística para
evitar corrida entre bloquear, seguir, curtir e comentar.

No Histórico, **Compartilhar na Comunidade** abre o compositor com a referência
selecionada, sem publicar nem mudar a privacidade. Apenas Ride próprio,
sincronizado, não excluído e público pode ser associado. Atividade privada pede
ajuste consciente no Histórico. Perfil público também é exigido para produzir
a prévia e servir o resumo, conservando a política da Parte 12.

O resumo recalculado na consulta contém ID, modo, dia de São Paulo, distância
arredondada em km, minutos ativos e `summary-only-v1`. Não contém título pessoal,
descrição, coordenadas, mapa, origem/destino, horários ponto a ponto, velocidades,
eventos, séries de força G ou inclinação. A política conservadora não gera mapa.
Mudar atividade/perfil para privado ou excluir Ride suprime o resumo na próxima
consulta. Texto e fotos independentes do post seguem seu próprio público.
Seguir não concede acesso aos endpoints privados de Histórico ou Replay.

Não existe cache compartilhado das APIs sociais nem cache no Service Worker.
O feed é atualizado explicitamente e ao retomar foco. Conteúdo já apresentado
em uma tela não pode ser recolhido de cópias externas; alterações de permissão
são obrigatoriamente refletidas em toda nova leitura/interação do servidor.

## API

Todas as rotas abaixo têm prefixo `/api/social`:

| Método e caminho             | Função                                           |
| ---------------------------- | ------------------------------------------------ |
| `GET /feed`                  | Público elegível e perfil público                |
| `GET /feed/following`        | Contas aprovadas seguidas, exige sessão          |
| `POST /posts`                | Criar publicação                                 |
| `GET /posts/:id`             | Ler com autorização                              |
| `PATCH /posts/:id`           | Atualizar texto, público e anexos próprios       |
| `DELETE /posts/:id`          | Exclusão lógica própria e expurgo das fotos      |
| `POST /posts/:id/like`       | Curtir idempotente                               |
| `DELETE /posts/:id/like`     | Descurtir idempotente                            |
| `GET /posts/:id/comments`    | Comentários paginados                            |
| `POST /posts/:id/comments`   | Comentar                                         |
| `DELETE /comments/:id`       | Excluir comentário próprio                       |
| `GET /users/search?q=`       | Descoberta por nome, usuário, cidade/UF públicos |
| `GET /users/:username`       | Perfil e relação do visualizador                 |
| `GET /users/:username/posts` | Posts elegíveis do perfil                        |
| `POST /users/:id/follow`     | Seguir ou solicitar                              |
| `DELETE /users/:id/follow`   | Deixar de seguir ou cancelar pedido              |
| `GET /users/:id/followers`   | Seguidores autorizados                           |
| `GET /users/:id/following`   | Contas seguidas                                  |
| `GET /requests`              | Solicitações recebidas próprias                  |
| `POST /requests/:id/approve` | Aprovar solicitante                              |
| `DELETE /requests/:id`       | Recusar solicitante                              |
| `DELETE /followers/:id`      | Remover seguidor próprio                         |
| `POST /blocks/:id`           | Bloquear conta                                   |
| `DELETE /blocks/:id`         | Desbloquear conta                                |
| `GET /blocks`                | Bloqueados próprios                              |
| `POST /reports`              | Denunciar post, comentário ou perfil             |
| `POST /media`                | Upload binário explícito de fotografia           |
| `GET /media/:id?size=thumb`  | Ler foto ou miniatura com autorização            |
| `DELETE /media/:id`          | Descartar upload pendente próprio                |
| `GET /rides/:id/preview`     | Prévia segura própria para composição            |

POST/PATCH de post recebe `{text, visibility, motorcycleId, rideId, mediaIds}`;
PATCH usa o estado completo editável, preservado pelo compositor. Denúncia recebe
`{kind, id, reason, detail?}`; motivos: `harassment`, `offensive`, `spam`, `fraud`,
`personal_data`, `dangerous`, `other`. Não existe leitura pública de denúncias.

Listagens recebem `limit` e `cursor`, retornam `{items, nextCursor}`. O cursor
opaco codifica data e UUID, tem validação estrita e não é credencial. A ordenação
usa data/ID decrescentes, com desempate estável; posts/comentários/relações sociais
usam precisão de milissegundo. Busca preserva microssegundos de contas existentes.
O cliente elimina sobreposição por ID, aborta pedidos antigos e carrega mais
itens por ação explícita. A consulta de feed produz anexos e contadores no SQL,
sem requisição por post nem download de todo o grafo social para filtrar no React.

Rate limiting distribuído usa `auth_rate_limits`: por minuto, 10 criações de
post, 15 uploads, 10 denúncias, 60 outras ações por rota/método e conta; 180
leituras por conta ou hash de IP/método. API responde 429 e `Retry-After: 60`.
Payload JSON geral permanece em 16 KiB; somente upload admite 5 MiB. Ações
exigem cookie ativo, origem autorizada, X-Apex-Request e CSRF da sessão.

## Roteiro Android/iPhone e desktop

Executar em Chrome Android, Safari iPhone e desktop com duas contas controladas.
Não há homologação física implícita nos testes Chrome automatizados.

1. Entrar, abrir Comunidade e publicar texto + foto, com e sem moto. Conferir
   prévia, público, card e recarga. Testar JPEG/PNG/WebP e rejeição de HEIC/SVG.
2. Curtir/descurtir, comentar, consultar páginas de comentários, excluir
   comentário próprio, editar post e confirmar exclusão. Conferir contagens.
3. Simular falta de rede durante publicação e curtida. Não deve aparecer sucesso;
   o texto precisa permanecer e a curtida manter o estado confirmado anterior.
4. Buscar a segunda conta, seguir público, consultar listas/feed Seguindo,
   cancelar seguimento, tornar perfil privado, solicitar, recusar/cancelar,
   solicitar novamente e aprovar. Remover seguidor deve revogar acesso.
5. Salvar/sincronizar Ride; usar Histórico → Compartilhar na Comunidade,
   conferir prévia e confirmar. A segunda conta só recebe resumo sem GPS.
   Alterar atividade para privada e atualizar: resumo e link devem ser negados.
6. Criar foto em post restrito, copiar URL e tentar sem sessão/por conta
   indevida; negar. Alterar post para privado e repetir URL antes acessível.
7. Bloquear a segunda conta; verificar API direta, feed, listas, comentários e
   mídia. Desbloquear não restaura relações. Registrar denúncia de post,
   comentário e perfil; duplicata deve ser informada sem apagar o conteúdo.
8. Conferir 320/360/375/390/430 px, desktop, teclado, botões, foco, foto ampliada,
   áreas de toque e navegação inferior. Confirmar gravação/exportação local
   anteriores sem upload de vídeo.

## Limites atuais e evolução

Não há grupos, chat, eventos ao vivo, mapa social, XP, ranking funcional, upload
de vídeo, transcodificação, moderação por IA ou painel administrativo nesta parte.
As áreas futuras conservam os títulos/identidade e não mostram grupos ou rankings
fictícios. Conquistas antigas continuam explicitamente ilustrativas.

Avatar usa o placeholder real existente: a Parte 03 ainda não implementa upload
de avatar. Não foi criado um segundo sistema para isso. Fotos podem ser removidas
e substituídas no editor; reordenação é suportada na API, sem controle dedicado
no compositor. Comentários são de um nível e não têm edição. Rascunho é mantido
em memória durante falha, sem fila offline nem persistência após fechar a página.
Listas públicas e descoberta não inferem localização por GPS. A busca por prefixo
não é recomendação geográfica ou busca textual por qualquer trecho.

Conteúdo pode receber `status='restricted'` por uma ferramenta administrativa
futura/autorizada, e a leitura será negada; não foram criados acessos privilegiados
ou endpoints de moderação. Retenção/expurgo de denúncias e dados logicamente
excluídos ainda precisam de política operacional antes do lançamento.

Para a Parte 19, identidades existentes, relação aprovada, estados dos posts,
anexos privados, paginação e política central podem ser reutilizados. Grupos
futuros precisarão de entidades/membros/permissões próprias e revisão da política;
nenhuma tabela, associação ou funcionalidade de grupo foi implementada aqui.
