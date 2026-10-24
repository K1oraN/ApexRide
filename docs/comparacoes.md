# Comparação de atividades na mesma rota — Parte 14

Abra uma rota em Explorar e escolha **Comparar atividades nesta rota**. O mesmo
acesso aparece nos detalhes de atividades sincronizadas do Histórico. Selecione
duas a quatro atividades e escolha **Comparar selecionadas**. A seleção fica na
URL; abrir um replay individual oferece **Voltar à comparação** e recalcula os
resultados com a autorização vigente. Não existe uma nova aba inferior.

## Arquitetura e dados

- `packages/ride-core/comparison.js`: referência espacial indexada, validação de
  continuidade, cobertura por união de intervalos, interseção de trechos,
  amostragem por distância e integração do tempo realmente observado.
- `apps/api/src/modules/comparisons/`: autorização, filtros, consultas limitadas,
  montagem de séries e resumos, agregação e revalidação antes da resposta.
- `apps/web/src/comparison/` e `pages/ComparisonPage.tsx`: seleção, resumos,
  mapa MapLibre reutilizado, gráficos e acesso ao replay.

São lidos os registros originais de `rides`, `ride_points`, `ride_motion`,
`ride_motion_samples`, `ride_performance_events`, `ride_laps` e `route_versions`.
Não são copiadas atividades, coordenadas ou sensores para tabelas de comparação.
Não há cache, materialização pública, novo detector de eventos ou alteração dos
algoritmos de captura, sincronização ou replay.

## Elegibilidade (14A)

O backend exige autenticação e autoriza cada ID. IDs repetidos, inválidos,
atividades excluídas, de outra rota ou indisponíveis são recusados. A lista é
paginada em até 50 itens; a seleção detalhada tem limite padrão de quatro.
A listagem informa modo, moto histórica, data própria, distância, duração ativa,
conclusão, versão e disponibilidade de sensores/GPS. A validação geográfica
definitiva ocorre ao comparar, com explicações por atividade.

O versionamento da Parte 11 já existe e foi reutilizado sem backfill:
`rides.route_id`, `route_version`, `route_snapshot` e `route_versions.plan`.
Versões numéricas distintas são compatíveis somente quando geometria, tipo,
sentido e linha de largada/chegada são idênticos. Geometria alterada é recusada
com 422; não há aproximação automática de versões. Duas atividades próprias da
mesma versão histórica aprovada podem ser comparadas entre si mesmo depois de
uma edição. A referência exibida é a versão histórica escolhida, identificada
nos cards. Rotas arquivadas ficam indisponíveis para novas comparações.

Estados retornados: integral, parcial, limitada e não comparável. Integral exige
95% de cobertura observada, ausência de rejeições/interrupções e observação das
extremidades, com tolerância de 0,5% da extensão limitada a 10–50 m. Menor
cobertura gera parcial; pontos rejeitados, lacunas e retornos tornam a análise
limitada. Menos de dois pares válidos, menos de 1% de cobertura ou ausência de
trechos comuns impedem diferenças numéricas comparativas. Um trajeto contrário
não é invertido para parecer equivalente.

## Alinhamento e trechos (14B)

A geometria aprovada é o eixo comum. Comprimentos são geodésicos; a projeção usa
um plano tangente e frações nos segmentos originais. Um índice espacial com
células de 100 m limita os candidatos próximos; segmentos longos são indexados
por subdivisão espacial, sem criar leituras GPS. PostGIS continua responsável
pela persistência e extração geográfica. Não é executado um ponto mais próximo
global para cada amostra.

Para escolher candidatos são considerados ordem temporal, deslocamento,
progresso anterior, orientação observada quando há movimento confiável e
continuidade do segmento. Alternativas próximas com progresso significativamente
distinto são rejeitadas como ambíguas. Sobreposições exatas podem, portanto,
ficar indisponíveis; o motor não escolhe um ramo arbitrariamente.

Regras iniciais: precisão até 20 m, corredor de 35 m, lacunas menores que 10 s,
mesmo segmento e mesmo intervalo ativo. Pausa, ponto rejeitado, desvio, ordem
temporal inválida ou salto espacial interrompe a cadeia. Retorno à rota começa
outra cadeia e não cobre o trecho ausente. Cobertura é a união de intervalos
observados, nunca a diferença entre o menor e o maior progresso.

A grade usa no mínimo 25 m e cresce com a extensão para aproximadamente 800
posições. Velocidade GPS e tempo podem ser interpolados somente entre dois
pontos contínuos e válidos. Sensores e velocidade assistida usam a amostra
registrada mais próxima, até 200 ms; não se inventam sensores intermediários.
Linhas do gráfico são interrompidas nas lacunas e mudanças de passagem.

Os trechos comuns são a interseção da cobertura das atividades. A duração de
cada trecho integra apenas pares temporais observados, incluindo permanência
observada no mesmo lugar durante intervalo ativo. Pausas ficam fora. Em múltiplas
passagens, a primeira passagem observada de cada posição é utilizada. Para
analisar uma volta específica, use o endpoint de voltas. O gráfico também
distingue tempo decorrido da atividade e tempo do segmento contínuo.

## Métricas e interface (14C)

Distância e tempos totais permanecem os consolidados da atividade: distância
validada, diferença para o plano, ativo, decorrido e pausado. Não são corrigidos
para coincidir com a rota. Diferenças entre totais somente aparecem na comparação
integral; a comparação parcial apresenta o tempo dos trechos efetivamente comuns.

Média e máxima GPS usam os valores históricos validados, sem obter máximos das
curvas interpoladas. GPS original e GPS Assistido têm séries e identificação
separadas. Assistido exige mesma versão e série não truncada em todas as sessões.
O esquema anterior não registra versão do cálculo dos totais GPS; essa limitação
é indicada na interface, sem atribuir uma versão fictícia ao histórico.

G longitudinal distingue aceleração positiva e frenagem negativa. Resumos de G e
inclinação exigem sensores em todas as atividades, calibração válida, mesma
montagem/versão e dados não truncados. As estimativas continuam limitadas pelos
sensores do celular. A inclinação dinâmica segue **indisponível** porque o esquema
anterior exige `lean IS NULL`; não foi inventado um valor nem alterada essa regra.
Ausência permanece `null`, nunca zero. Eventos 0–100 e 100–0 são os persistidos;
eventos inconclusivos não têm tempo comparável.

O mapa usa a geometria planejada cinza, trechos comuns em cinza claro e GPS próprio
nas cores das atividades. Há zoom, centralização, legenda e aviso de redução.
Pausas e lacunas dividem linhas. Os originais continuam intactos. Mapas/gráficos
mantêm cores consistentes; tabelas possuem rolagem interna em telas pequenas.
Fundo, painéis, tipografia, vermelho Racing, velocímetro e cinco abas continuam
os existentes. Alterações em Histórico, Replay e rotas se limitam às integrações.

## Filtros

Categoria, faixa de cilindrada, fabricante e modelo filtram as motos históricas.
Faixas iniciais: até 250, 251–500, 501–750, 751–1000 e acima de 1000 cc.
Taxonomia e faixas estão centralizadas no módulo compartilhado. Categorias só
vêm de `motorcycle_model_categories`, com fonte HTTPS e data de verificação,
alimentada por operador. A tabela começa vazia. Não há inferência por cilindrada
nem novos campos obrigatórios na Garagem.

Município, UF e região usam os metadados da rota e abrangem o Brasil inteiro.
Não consultam residência do piloto. Para descobrir percursos próximos antes da
seleção, reutilize a busca geográfica de Explorar; a comparação não procura
sessões de outras rotas nem solicita uma nova localização.

## Consentimento e comunidade (14D)

`comparison_enabled` é um opt-in separado e inicialmente falso. A autorização
esportiva `comparison_technical` também é separada e inicialmente falsa. O
proprietário pode revogar a qualquer momento. Perfil privado, atividade privada,
conta desabilitada ou atividade excluída prevalecem sobre o opt-in.

Em vias comuns, IDs e séries de atividades de terceiros não são oferecidos na
seleção direta. Somente agregados autorizados e não competitivos aparecem:
distância média aproximada, duração ativa média aproximada, conclusão e frequência.
Não há GPS, horários, velocidade, G, eventos ou inclinação de terceiros nessa via.

Agregados exigem pelo menos **10 participantes distintos**, cada conta contribuindo
com uma média própria para não dar peso maior a quem gravou mais atividades.
Somente células fixas e disjuntas de categoria × faixa de cilindrada são
consultáveis. Não há total geral, intervalos arbitrários, filtros de marca,
modelo ou datas comunitários que permitam subtrações entre recortes sobrepostos.
Contagens exatas e identificadores dos participantes não são retornados. Sem o
mínimo, a resposta é **Dados insuficientes para comparação comunitária**.
Não há promessa de anonimização formal/differential privacy; o limiar e os
recortes são barreiras conservadoras, e mudanças ao longo do tempo exigem revisão
de privacidade antes de ampliar o produto.

Respostas usam `private, no-store`. A comparação detalhada verifica novamente
visibilidade, consentimento, revisão e estado da rota depois de processar. Mudanças
durante a consulta impedem a entrega. Revogar afeta imediatamente novas consultas;
não há cache derivado a invalidar. Dados já recebidos por um cliente autorizado
não podem ser apagados remotamente da memória desse cliente.

## Circuitos

Comparação técnica de terceiros exige circuito fechado atualmente verificado,
Modo Pista, opt-ins efetivos e geometria vigente. A sessão precisa ter sido
registrada depois da verificação. Mesmo nessa autorização não são devolvidos
GPS de terceiros ou horários absolutos; eventos também removem timestamps
internos de força/calibração.

`compare-laps` recebe uma volta de cada atividade. Exige mesmo circuito,
geometria, sentido e linha, volta estimada persistida com precisão até 20 m e
método `gps-line-intersection-v1`. Não recalcula voltas. Retorna duração,
diferença, qualidade e séries limitadas ao período observado da volta. Não cria
ranking global. Nesta versão, a seleção compara atividades distintas; comparar
duas voltas da mesma atividade em uma única seleção não está disponível.

## Banco, API e operação

Migrações aditivas `013_comparisons.sql` e `014_comparison_category_index.sql`:
opt-ins/revisão, índices de rota/proprietário/data, versão/modo/visibilidade,
cilindrada e mapeamento de modelos com unicidade sem diferença de caixa.
Nenhuma sessão anterior é duplicada ou habilitada automaticamente.

| Método e caminho                            | Conteúdo                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET `/api/routes/:id/comparison-candidates` | Candidatas próprias ou técnicas autorizadas; `page`, `limit`, filtros e `scope=own/technical` |
| POST `/api/routes/:id/compare`              | `{activityIds:[id1,id2]}`                                                                     |
| GET `/api/routes/:id/comparison-stats`      | `category` e `ccBand` fixos; agregados protegidos                                             |
| PATCH `/api/rides/:id/comparison-privacy`   | `{enabled:boolean,technical:boolean}`, somente proprietário e CSRF                            |
| POST `/api/circuits/:id/compare-laps`       | `{activityIds:[id1,id2],lapNumbers:[1,2]}`                                                    |

POSTs têm limite de 2 KiB e alteração de permissão, 1 KiB. Há limites por conta
de 12 comparações e 60 demais consultas/minuto. Até 200.000 pontos por pedido,
50.000 por sessão já limitado pela captura anterior, índice espacial de até
300.000 entradas, rejeição de geometrias patológicas, orçamento de 2 s por
alinhamento e verificação de 8 s entre atividades. Consultas PostgreSQL continuam
com timeout de 5 s. São exibidos até 800 trechos comuns no mapa, 100 trechos na
lista, 500 voltas e 200 eventos por atividade. Tais limites podem omitir itens de
exibição; o histórico original continua acessível separadamente.

Configure `COMPARISON_MAX_ACTIVITIES` (2–4, padrão 4) e
`COMPARISON_MIN_PARTICIPANTS` (10–1000, padrão 10) no backend. Precisão, grade,
corredor e orçamento estão centralizados em `COMPARISON_RULES`. Não se recalcula
alinhamento em renderizações React; os gráficos recebem séries processadas.

Execute `npx --yes pnpm@10.34.7 db:migrate`, depois os comandos existentes de
desenvolvimento. Não houve deploy. Offline completo não foi implementado: falta
de rede apresenta mensagem, mantém IDs selecionados e permite retentativa. O
IndexedDB e os IDs estáveis da sincronização anterior foram preservados.

## Roteiro Android/iPhone físico — pendente

1. Login, rota cadastrada e duas atividades próprias; selecionar e comparar.
2. Conferir distância, ativo/decorrido/pausado e cobertura contra os originais.
3. Conferir mapa/zoom/centralização e séries por distância/segmento, incluindo
   atividade parcial, pausa, desvio e perda de sinal. Lacunas devem interromper.
4. Conferir ausência de sensores, GPS Assistido identificado e G calibrado quando
   houver dados reais. Inclinação dinâmica deve continuar indisponível.
5. Abrir replay individual e retornar; conferir seleção preservada e nova consulta.
6. Ficar offline, tentar comparar, reconectar e repetir sem duplicar atividades.
7. Com duas contas, conferir opt-in inicialmente falso, ausência de acesso a GPS
   e telemetria de terceiros em vias comuns e bloqueio por IDs diretos.
8. Em grupo de teste com dez contas distintas, consultar agregado, revogar uma
   participação e verificar supressão. Repetir com perfil/atividade privados.
9. Em circuito sintético verificado, usar Modo Pista, opt-in técnico e voltas
   registradas. Conferir tempos matematicamente, sentido, linha e versões.
10. Conferir legibilidade/rolagem/touch, memória e fluidez em Android e iPhone.

Não produza dados de teste mediante pilotagem arriscada em vias públicas.

## Limites e preparação futura

Não existe comparação comunitária offline, reconhecimento de trajetos sem o
mesmo ID de rota, tolerância automática entre geometrias editadas, ranking,
gamificação, vídeo ou novos recursos sociais. Sobreposições geográficas ambíguas
podem perder cobertura de forma conservadora. O registro de inclinação dinâmica
e a homologação física continuam pendentes.

A referência espacial, os intervalos de cobertura e a interseção são funções
isoladas que poderão receber outra origem de candidatos no futuro. A Parte 15
não foi iniciada: nenhum reconhecimento automático de rotas semelhantes foi
implementado.
