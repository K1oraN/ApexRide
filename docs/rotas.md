# Rotas, circuitos e acompanhamento — Parte 11

O módulo reutiliza contas, Garagem, controlador Ride, MapLibre, IndexedDB e o
protocolo de sincronização existentes. Não solicita GPS ao abrir Explorar.
A posição só é solicitada por **Perto de mim**, **Ativar GPS** ou **Iniciar Ride**.
Não há transmissão pública de localização nem ranking de tempos.

## Usar localmente

1. Execute `pnpm db:migrate` e reinicie a API com `pnpm dev`.
2. Abra `/explorar`. Sem conteúdo aprovado, os estados vazios são esperados.
3. Entre e abra **Criar percurso**. Informe nome, cidade/UF e categoria.
4. Toque no mapa para origem, paradas e destino. Reordene/remova pelos botões.
5. Calcule por vias existentes ou escolha explicitamente desenho manual.
6. Salve um rascunho privado; nos detalhes, solicite publicação voluntariamente.
7. Um moderador distinto deve revisar a geometria, o conteúdo e aprovar.
8. Depois, favorite ou escolha **Seguir rota**. A preparação Ride continua usando
   a mesma moto, modos, GPS Puro/Assistido, sensores e controles anteriores.

## Banco e privacidade

As migrações aditivas `008_routes.sql`, `009_route_rides.sql` e
`010_route_laps.sql` criam:

- `routes`: estrutura comum de rotas e circuitos; geometria LineString SRID 4326,
  distância calculada com `ST_Length(geometry::geography)`, fonte, publicação,
  versão, linha orientada e verificação de pista.
- `route_waypoints`: origem, paradas e destino ordenados, no mesmo SRID.
- `route_favorites`: chave única `(user_id,route_id)` e contagens reais.
- `route_moderators`: autorização concedida somente pelo operador do banco.
- `route_decisions`: ator, data, ação, motivo, versão e geometria revisada.
- `route_versions`: plano aprovado preservado por percurso/versão, incluindo o
  instante de verificação de pista, para sincronização posterior ao arquivamento.
- `rides`: referência opcional ao percurso/versão, plano e resultado separado.
- `ride_laps`: sessão, circuito, versão, número, instantes, duração estimada e
  metadados de qualidade. Sessões anteriores continuam sem associação.

GiST cobre geometria e geography; GIN cobre busca textual em português. Índices
por proprietário, publicação/tipo, favoritos e associação com Ride complementam
as consultas. Listagens retornam geometria simplificada; detalhes e cálculos usam
sempre a fonte completa. Não são publicados rascunhos, pendentes, rejeitados ou
arquivados. Favoritos públicos também exigem aprovação. A identidade do autor não
inclui email nem coordenadas externas à geometria cadastrada. Atividades continuam
protegidas pelos endpoints exclusivos de seu proprietário.

Arquivar preserva o registro e todas as atividades. Qualquer edição retira a
publicação e revoga a verificação; incrementa a versão e volta a rascunho, que
precisa de novo envio e revisão. Uma geometria nova nunca substitui silenciosamente
uma publicação aprovada. Versões anteriores continuam disponíveis internamente
para as sessões offline que já as carregaram.

## Roteamento

A integração usa o serviço Route do OSRM, conforme sua
[documentação oficial](https://project-osrm.org/docs/v5.24.0/api/#route-service),
com GeoJSON completo, origem/paradas/destino na ordem fornecida e sem alternativas.
Configure no backend:

```dotenv
ROUTING_OSRM_URL=https://seu-servidor-autorizado
ROUTING_OSRM_PROFILE=driving
ROUTING_OSRM_TOKEN=
```

Nenhum servidor demo é configurado por padrão. Em produção a URL exige HTTPS e
rejeita `router.project-osrm.org`. O operador deve usar infraestrutura própria ou
contratada e confirmar licença/termos do serviço e dos dados. O token opcional
vai somente no cabeçalho Authorization do backend. O navegador não recebe segredos.
O perfil real é o preparado no servidor OSRM; `driving` não certifica restrições
específicas para cada motocicleta, acesso atual, segurança ou condições da estrada.
O resultado é uma sugestão de caminho, sem garantia de trafegabilidade.

Há limite de 2–25 pontos, até 10.000 vértices na resposta, timeout de 8 s, corpo de
resposta até 2 MB, seis cálculos/minuto por conta e quatro requisições simultâneas
por processo. Não há retentativa automática nem chamadas a cada movimento do mapa.
Em implantação com vários processos, os limites precisam de armazenamento
compartilhado ou controle no gateway. A configuração de URL é do operador, nunca
entrada do usuário. Redirecionamentos não são seguidos.

Falhas não apagam pontos nem geram linhas retas. **Desenho manual** é uma escolha
explícita, identificada como sem validação viária e sem duração estimada. A distância
é conferida pelo backend. A duração OSRM, quando presente, é estimada; não se usa
uma velocidade arbitrária para inventar duração ausente. Os campos descritivos e
fonte de trajetos submetidos por usuários ficam sujeitos à revisão do moderador.

## Moderação e circuitos

O operador pode conceder autorização a uma conta já existente, após conferir sua
identidade. Não existe endpoint de autoatribuição desse papel:

```sql
INSERT INTO route_moderators(user_id) VALUES ('UUID-DA-CONTA-AUTORIZADA');
```

Acesse `/explorar/moderacao`. A lista é paginada em 50 itens e contém pendências
e publicados para revisão/verificação/arquivamento. A API exige papel no banco,
sessão válida, CSRF e origem autorizada. Ninguém modera seu próprio cadastro.
Uma decisão exige versão atual e motivo com pelo menos cinco caracteres. A
geometria e as decisões anteriores aparecem no fluxo mínimo de revisão.

Rascunhos → pendentes → aprovados/rejeitados; arquivados saem da exploração.
Circuitos cadastrados começam **sugeridos**; pendentes aparecem como **Em análise**.
Aprovação pública não habilita voltas. A verificação para pista exige circuito
aprovado, fechamento em até 50 m, linha de largada/chegada de 2–100 m que atravesse
o percurso no sentido escolhido e confirmação administrativa de área fechada
autorizada. A revisão humana deve conferir evidências reais da instalação; a
confirmação não é uma verificação geográfica automática. Nenhuma pista real foi
verificada nesta entrega. Um passeio circular de rua continua sendo uma rota.

A linha é orientada pelos dois toques A e B. Direção +1 significa cruzar do lado
direito para o esquerdo; -1 significa o inverso. A linha deve ser transversal à
pista, com os extremos identificados pela ordem de seleção. É possível remover
uma verificação arquivando o conteúdo. Edição também revoga a verificação da nova
versão; o registro histórico da versão anteriormente utilizada é preservado.

## APIs

Todas usam prefixo `/api`. Escritas exigem sessão e proteções de origem/CSRF da
Parte 03. IDs, geometrias, tamanho de corpo, limites e parâmetros são validados.

| Endpoint                                     | Acesso e comportamento                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /routes`                                | Público, somente aprovados                                                   |
| `GET /routes/nearby`                         | Público, exige `lon`, `lat`; raio em metros                                  |
| `GET /routes/mine`                           | Conta atual, inclui seus estados privados                                    |
| `GET /routes/favorites`                      | Conta atual, somente favoritos ainda aprovados                               |
| `GET /routes/:id`                            | Aprovado ou proprietário/moderador                                           |
| `POST /routes`, `POST /circuits`             | Autenticado; cria rascunho                                                   |
| `PATCH /routes/:id`, `PATCH /circuits/:id`   | Proprietário; edição completa dos campos permitidos; nova versão privada     |
| `DELETE /routes/:id`, `DELETE /circuits/:id` | Proprietário; arquiva                                                        |
| `POST /routes/:id/submit`                    | Proprietário; envia rascunho/rejeitado para revisão                          |
| `POST`, `DELETE /routes/:id/favorite`        | Conta atual; adição idempotente/remoção isolada                              |
| `POST /routes/calculate`                     | Conta atual; OSRM limitado                                                   |
| `GET /circuits`, `GET /circuits/:id`         | Mesmas regras de leitura; somente circuitos                                  |
| `GET /admin/routes?page=1`                   | Moderador; pendentes e aprovados, 50 por página                              |
| `GET /admin/routes/:id/decisions`            | Moderador; últimas 100 decisões                                              |
| `POST /admin/routes/:id/decisions`           | Moderador distinto do autor; `approve`, `reject`, `archive`, `verify`        |
| `POST /rides` e `/rides/sync/*`              | Protocolo anterior, associação opcional e recálculo do resultado no servidor |
| `GET /rides/:id`                             | Proprietário; pontos reais, plano, resultado e voltas estimadas              |

Filtros: `q`, `kind=route|circuit`, `city`, `state`, `page` (1–1000), `limit`
(1–50), `sort=recent|nearest|favorites|shortest|longest`, `lon`, `lat`, `radius`
(100–100.000 m), `bbox=west,south,east,north` (máximo 15° em cada eixo).
A ordenação nearest exige centro. `ST_DWithin` usa geography para metros;
`bbox` usa interseção indexada, sem carregar todos os percursos. A região inicial
é Alagoas; isso não afirma que o usuário esteja nessa localização. O filtro Ao
vivo continua explicitamente sem transmissões.

## Progresso, desvio e offline

`RouteTracker`, em `packages/ride-core/routes.js`, processa cada ponto aceito pelo
controlador existente. A projeção usa plano tangente local por segmento e extensão
geodésica. Restrição de continuidade da posição projetada, movimento plausível e
união dos intervalos observados evitam saltos e dupla contagem em retornos.
Não se usa apenas distância ao destino. Em circuitos, a transição entre fim e
início é tratada ciclicamente. Progresso é aproximado e não é navegação curva a curva.

Precisão horizontal acima de 20 m deixa progresso indeterminado. A tolerância de
correspondência é `max(25 m, 2 × precisão)`. Leituras além dela indicam possível
desvio; três ou mais leituras e pelo menos cinco segundos confirmam **Fora da rota**.
Pausa, troca de segmento ou lacuna de 10 s impedem preencher o trecho faltante.
A projeção contínua busca até 300 m ao redor da posição anterior e limita avanço
pela distância GPS entre as leituras mais a incerteza. Vias paralelas dentro da
incerteza GPS ainda são ambíguas: não existe map matching viário ou garantia de
identificar a pista correta. O painel informa estimativa, sem alertas repetidos
ou recálculo remoto automático.

Conclusão exige cobertura observada de pelo menos 95% e projeção perto do final.
Passar perto do destino sem cobertura não conclui. Salvar não depende da conclusão.
O resultado registra concluída, parcial, abandonada ou indeterminada. Só é possível
deixar de acompanhar a rota durante pausa, sem encerrar a sessão GPS.

O plano completo fica no payload da atividade. Os checkpoints IndexedDB e os
manifestos/lotes existentes preservam esse campo sem uma nova fila de edições.
Acompanhamento e gravação continuam localmente depois de perder internet. Mapas
novos e roteamento remoto dependem de rede; não são baixados nem armazenados tiles.
Na recuperação, progresso e voltas são recalculados dos pontos realmente persistidos.
O servidor confronta a geometria com a versão aprovada e recalcula os resultados;
não aceita tempos ou percentuais enviados pelo cliente como verdade.

## Voltas estimadas

Somente Modo Pista com circuito verificado, linha e direção habilita `LapDetector`.
Cada par de leituras GPS consecutivas é testado contra o segmento finito de
largada/chegada. A interpolação é exclusivamente do instante de cruzamento; não
são inseridos pontos GPS sintéticos na atividade. O primeiro cruzamento inicia a
volta; o próximo só a completa com:

- direção correta, precisão até 15 m, intervalo entre leituras menor que 5 s;
- mesmo segmento, velocidade espacial plausível até 100 m/s e proximidade da pista;
- afastamento maior que `max(20 m, 2 × precisão)` para rearmar o detector;
- pelo menos 90% de cobertura do circuito durante a volta;
- duração de pelo menos `max(10 s, extensão / 100 m/s)` e no máximo seis horas.

GPS ruim, pausa, lacuna, tempo inconsistente ou saída do circuito interrompem a
volta corrente. Cruzamentos incompletos não viram recordes. O resumo exibe voltas,
melhor estimativa, tempos em décimos de segundo e interrupções; há sempre um trecho
potencialmente incompleto após o último cruzamento. O backend também exige que a
verificação tenha ocorrido antes do início da sessão; verificar uma pista depois
não cria retroativamente tempos válidos. `ride_laps.quality` guarda método e pior
precisão da volta. Não há certificação profissional, ranking ou publicação dos tempos.

## Validação física pendente — Android e iPhone

Em cada plataforma, com HTTPS e aparelho real:

1. Abrir Explorar sem permissão GPS e confirmar consulta por nome/cidade/UF.
2. Criar desenho de teste em local permitido; calcular com OSRM configurado e
   verificar vias/paradas. Desconectar o provedor e conferir preservação dos pontos.
3. Testar rascunho, envio, revisão por outra conta, favorito e edição com retirada
   da publicação. Conferir que outra conta não vê conteúdo privado.
4. Abrir detalhes, selecionar rota, moto e modo; só então autorizar GPS.
5. Caminhar em local seguro: comparar posição, traçado real e progresso aproximado.
6. Pausar, retomar, simular perda de precisão e desvio em baixa velocidade, sem
   manobras arriscadas. Confirmar que GPS ruim não confirma desvio.
7. Desconectar internet, continuar a caminhada, finalizar incompleta e salvar no
   aparelho. Reconectar e conferir confirmação do servidor e associação da rota.
8. Reabrir uma sessão interrompida; comparar apenas os pontos persistidos.
9. Para circuitos, usar primeiro séries controladas. Homologação em pista fechada
   exige autorização, revisão do traçado/linha/sentido e comparação com referência
   adequada. Não é necessário pilotar para os testes de acompanhamento.
10. Conferir toque, zoom, atribuição, orientação da tela e consumo de recursos.
    Suspensão de aba, tela bloqueada e navegador fechado não garantem coleta.

Nenhum resultado automatizado equivale a validação física ou liberação de pista.

## Preparação para histórico

Os endpoints existentes do proprietário podem consultar `rides`, `ride_points`,
`route_snapshot`, `route_result` e `ride_laps`. O plano escolhido continua distinto
do trajeto real. Arquivamento e novas revisões não removem atividades anteriores.
A Parte 12 poderá montar o histórico a partir dessas associações, sem novo sistema
de atividades. Histórico completo, replay, comparação, social e voz não foram
implementados aqui.
