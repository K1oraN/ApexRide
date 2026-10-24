# Reconhecimento de trajetos — Parte 15

Abra uma atividade sincronizada no Histórico e escolha **Trajetos Semelhantes**.
A análise usa o GPS registrado e funciona sem rota cadastrada. Escolha uma
correspondência para ver as duas atividades, o trecho comum e a comparação.
O Histórico também apresenta grupos privados integralmente compatíveis.
Explorar oferece descobertas regionais agregadas mediante autorização explícita.
As cinco abas e o design Racing Tech foram preservados.

## Arquitetura e operação

`apps/api/src/modules/similarity/` separa preparação, motor, referência,
persistência, fila, regiões, autorização e agregação. O frontend usa componentes
próprios pequenos e reutiliza MapLibre, filtros, cores e `ComparisonResults`.
Não há dependência nova, serviço externo obrigatório no reconhecimento ou deploy.

```powershell
npx --yes pnpm@10.34.7 db:migrate
npx --yes pnpm@10.34.7 similarity:regions
npx --yes pnpm@10.34.7 dev
```

O segundo comando importa o snapshot dos 102 municípios de Alagoas fornecido
em `database/reference/alagoas-regions.json`, obtido em 23/10/2026 nas APIs
oficiais de [malhas](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3)
e [localidades](https://servicodados.ibge.gov.br/api/docs/localidades).
O arquivo registra os URLs exatos. Não contém atividades ou pessoas.
São polígonos administrativos simplificados, não limites topográficos precisos.

Para outras UFs, prepare o mesmo formato com `sourceUrl` oficial IBGE e
`regions:[{id,city,state,geometry}]`, usando códigos municipais de sete dígitos:
`pnpm --filter @apex-ride/api similarity:regions caminho-absoluto.json`.
A importação é exclusiva do operador, transacional e rejeita polígonos inválidos,
fontes não IBGE e sobreposição de interiores. Atribuições são atualizadas em
lotes de 100. Nenhum endereço residencial é consultado. Somente trajetos
integralmente cobertos por um município recebem sua classificação; travessias de
municípios/fronteiras simplificadas podem permanecer sem região. Não se atribui
cidade ou UF por suposição. Novos imports ampliam a cobertura regional.

## 15A — Preparação e índice

São lidos `rides.active_intervals` e `ride_points`, originalmente persistidos nas
Partes 06/10. O esquema existente aceita somente pontos `quality='accepted'`;
saltos rejeitados na captura não entram na tabela. A preparação também valida
coordenadas, precisão, ordem, pausas e saltos. Originais nunca são alterados.

Ordenação temporal estável usa a ordem capturada para desempatar. Se a ordenação
original foi corrompida, a sessão fica inelegível em vez de reconstruir uma linha.
Pontos com timestamp e posição duplicados não acrescentam distância. Posições
estacionárias com timestamps distintos permanecem observadas. Intervalos ativos
inválidos são recusados; a procura do intervalo utiliza busca binária.

Mudanças de segmento/intervalo, precisão acima de 10 m, lacunas a partir de 10 s
e saltos acima de `100 m/s × dt + 10 m` interrompem as linhas. Limites:
50.000 pontos, 64 segmentos úteis, 300 m a 300 km válidos, latitude entre ±85°.
Menos de seis pontos ou dados fora desses limites resultam em insuficiência.

A extensão válida é a soma de distâncias geodésicas entre pontos originais
contínuos. A representação de busca é `geography(MultiLineString,4326)`, com
GiST. Douglas–Peucker em plano local dependente da latitude remove desvios até
0,5 m, limitado a 5 milhões de inspeções e 10.000 vértices por segmento.
Não há interpolação de lacunas. As distâncias espaciais SQL usam metros em
`geography`; graus não são tratados como metros.

`CANDIDATES_SQL` usa `ST_DWithin(...,30)` antes do cálculo detalhado e consulta
41 registros para detectar truncamento, processando no máximo 40. A proximidade
é apenas pré-seleção. São aceitos candidatos próprios ou pares em que ambas as
contas/atividades autorizam a participação comunitária vigente.

## 15B — Algoritmo similarity-1

O motor reutiliza o índice de segmentos e `alignActivity` da Parte 14. Executa
o alinhamento de cada segmento de A contra B nos sentidos direto e inverso.
Considera afastamento, progressão espacial, orientação observada, continuidade,
qualidade e cobertura. Não depende da bússola do aparelho. Não usa Fréchet ou
Hausdorff isoladamente nem promete precisão estatística.

Um trecho precisa conter ao menos 300 m contínuos e cinco pares observados,
com corredor de 8 m e precisão horizontal até 10 m. A mediana dos afastamentos
acima de 3 m torna a identidade da via inconclusiva. Alternativas próximas com
progressos incompatíveis são rejeitadas pelo alinhador. Cada parte de A/B só
pode contribuir uma vez; sobreposição significativa de atribuições é excluída.
Um cruzamento isolado ou vários contatos curtos não são somados artificialmente.

Para intervalos espaciais aceitos `R_A` e `R_B`:

- `coverageA = min(1, comprimento(união(R_A)) / extensãoVálidaA)`.
- `coverageB = min(1, comprimento(união(R_B)) / extensãoVálidaB)`.
- `sharedMeters = min(comprimento(união(R_A)), comprimento(união(R_B)))`.

A usa progresso na representação simplificada; B usa a extensão original nos
pares correspondentes. São estimativas, não distância certificada da estrada.
As duas coberturas são independentes. Não há índice apresentado como certeza.

**Muito semelhante** exige ambas as coberturas ≥95%, mesmo sentido e ausência
de rejeições/interrupções. **Parcial** exige trecho válido, sem equivalência
total. **Contrário** tem todos os trechos invertidos. **Limitada** indica
sentido misto, rejeições ou interrupções. **Inconclusivo** cobre insuficiência
ou afastamento ambíguo. **Não semelhante** não produz par persistido.

Os parâmetros ficam centralizados e versionados em `RULES` e `alignmentRules`.
Alterações que mudem resultados exigem nova versão, iniciando um novo cursor de
backfill. Resultados de versões distintas não são misturados nas consultas.

## Trechos, direção e comparação da Parte 14

Cada trecho guarda geometria, direção, extensão e janelas temporais A/B.
Referências derivadas concatenam somente o eixo de distância de partes válidas;
não acrescentam segmentos geográficos entre elas. As coberturas são separadas
nas fronteiras de cada parte. GPS e timestamps originais continuam disponíveis
para Histórico e Replay.

`compareActivities` aceita a referência interna derivada e autoriza novamente
as duas atividades próprias. Reutiliza alinhamento, integração temporal,
amostragem, sensores, gráficos, resumos e mapas. Somente pontos das janelas
aceitas entram no alinhamento; séries são restritas à interseção final. O mapa
preserva os dois percursos completos, respeitando interrupções. Selecionar um
trecho comum centraliza e indica suas extremidades.

Tempo observado integra exclusivamente pares contínuos. Média comum é
`metrosComuns / milissegundosObservados × 3600`, em km/h. Máxima comum usa
velocidade GPS validada observada, sem extrair máximos da curva interpolada.
GPS Assistido e sensores mantêm versões, calibração e identificação de origem.
Força G/inclinação ausentes permanecem `null`. Estatísticas totais de sensores
e eventos não são reutilizadas como métricas do trecho derivado. Totais
históricos permanecem contexto; diferenças entre totais ficam indisponíveis
quando a correspondência é parcial. Sentidos contrários/mistos não habilitam
comparação orientada. Circuitos da Parte 14 mantêm seus endpoints e regras.

## Grupos e filtros

O agrupamento é determinístico e exige um par integral entre **todos** os
membros. A–B e B–C não bastam para incluir A–C. Grupos são recalculados a partir
dos pares vigentes, sem publicar rotas. Há limite de 1.000 pares por consulta e
paginação dos grupos; a resposta informa truncamento.

Categoria, cilindrada, marca e modelo usam `bikeFilters`, `CC_BANDS` e a
taxonomia da Parte 14. Categoria depende de fonte verificável na tabela de
modelos; não se infere da cilindrada. Cidade, UF e região dependem exclusivamente
dos polígonos administrativos do trajeto. Sem metadados, o filtro não encontra
correspondência. O navegador não solicita GPS para executar esses filtros.

## 15C/15D — Privacidade e comunidade

As listas de pares, geometrias, grupos, status e comparações detalhadas são
exclusivas do proprietário. IDs diretos de terceiros são recusados mesmo para
atividade pública e consentida. Participação permanece inicialmente falsa e
usa o consentimento da Parte 14, agora também disponível sem rota cadastrada.
Telemetria técnica continua restrita a circuito fechado verificado.

A comunidade recebe apenas um agregado regional, em célula fixa de município ×
categoria × faixa de cilindrada. Ambos os lados precisam estar atualmente
autorizados, públicos, ativos, processados e na mesma célula. São exigidos pelo
menos dez proprietários distintos, cada um com uma média própria. A resposta
mostra existência e extensão aproximada arredondada em km, sem contagem exata,
IDs, nomes, coordenadas, horas, velocidade, G ou inclinação. Não afirma que todos
formam um grupo integral único. Não há consulta por ponto, rua, bounding box,
atividade de referência, marca, modelo ou intervalo arbitrário comunitário.

Essa saída regional evita expor origem, destino e retornos perto de locais
sensíveis; nenhuma geometria pública é construída. Não é anonimização formal.
Correlação temporal e informação externa continuam limitações; a ampliação das
saídas exige nova análise de privacidade. Não há mapas de rotinas ou rankings.

Não existe cache de API ou resultado público materializado. Cada agregado lê
consentimento e privacidade vigentes no mesmo statement SQL. Revogação remove
pares derivados e reenfileira a análise; exclusão lógica remove o índice e seus
pares em trigger. Perfil/atividade privados e conta inativa deixam de satisfazer
os predicados imediatamente. Reprocessamento invalida referências anteriores;
a comparação revalida o par antes da entrega. Respostas usam `private, no-store`,
`Vary: Cookie` e `noindex`. Logs não contêm coordenadas ou erros SQL brutos.

## Banco, fila e custo operacional

Migrações aditivas 015/016 criam regiões, índice geográfico privado, pares
canônicos únicos `(a,b)` com `a<b`, triggers e cursor persistido de backfill.
FKs removem dependências; não duplicam atividades ou séries completas de GPS.
São persistidos somente representação de busca, qualidade, versão e trechos
derivados necessários. Não se modificam métricas históricas.

O trigger de INSERT enfileira atomicamente no salvamento/sincronização.
A confirmação não aguarda o reconhecimento. O worker inicia com a API em
desenvolvimento/produção e executa duas atividades por ciclo de 1 s, sem trabalhos
concorrentes no mesmo processo. Testes chamam `processBatch` explicitamente.
`FOR UPDATE SKIP LOCKED`, token e lease de 2 min evitam publicação por worker
obsoleto e permitem recuperação após reinício. Há três tentativas, espaçadas em
1 min. Erros secundários não removem o Ride nem travam seu Histórico.

O backfill avança em lotes de 25 por UUID usando chave primária e checkpoint
versionado. Depois de concluído, fica ocioso sem varrer todas as sessões.
Novas sessões são capturadas pelo trigger. Para auditar/reconstruir índices
internos manualmente removidos, o operador pode remover o checkpoint da versão;
o próximo ciclo retoma a varredura limitada. Versão alterada cria novo cursor.

Limites adicionais: 6 s por par, 20 s entre candidatos de um trabalho, 2 s por
alinhamento da Parte 14 e timeout SQL existente de 5 s. Um par pode terminar
depois do limite entre candidatos; a resposta de status informa truncamento.
O orçamento pode produzir lista incompleta. Há até 50 resultados por página,
12 operações caras e 60 consultas por conta/minuto, CSRF e limites de body.
Reprocessar exige espera de 1 min e não reinicia trabalho em andamento.

Preparação custa `O(n log n + i log i + n log i)`, com n pontos/i intervalos.
Simplificação tem orçamento explícito. O índice do alinhador limita segmentos
próximos; candidatos patológicos são rejeitados. O limite de 64 segmentos e
40 candidatos evita comparação global entre todos os pares. Grupos podem ter
custo quadrático local, limitado a 1.000 arestas; isso não percorre o banco.

## API

Todos os caminhos abaixo usam `/api`, autenticação e autorização no servidor.

| Método | Caminho                           | Uso                                                        |
| ------ | --------------------------------- | ---------------------------------------------------------- |
| GET    | `/rides/:id/similar`              | Pares próprios; filtros da Parte 14 e paginação            |
| GET    | `/rides/similar-groups`           | Grupos privados; page/limit                                |
| GET    | `/rides/:id/similarity-status`    | Estado, motivo, versão e truncamento                       |
| POST   | `/rides/:id/similarity/reprocess` | Body vazio, CSRF e cooldown                                |
| POST   | `/rides/:id/similar/compare`      | `{activityId}` próprio; referência calculada pelo servidor |
| GET    | `/similarity/regions`             | Até 500 municípios disponíveis, AL primeiro                |
| GET    | `/similarity/community`           | regionId, category e ccBand obrigatórios e fixos           |
| PATCH  | `/rides/:id/comparison-privacy`   | Consentimento existente estendido a sessões sem rota       |

## Limitações e validação física pendente

Vias exatamente sobrepostas em níveis distintos ou separadas por menos que o
erro GPS não podem ter identidade rodoviária certificada. O resultado descreve
semelhança geométrica observada; não existe map matching nem informação de nível
viário. Limites conservadores recusam muitos percursos legítimos com GPS ruim.
Sobreposições/voltas repetidas podem perder cobertura se a ordem for ambígua.
Os limiares foram testados em geometria sintética, não calibrados em corpus
representativo de diferentes aparelhos/rodovias. Não há percentual de acurácia.

Reconhecimento novo exige backend. Offline mantém Histórico/Replay/atividades
e explica a indisponibilidade de novas análises; não há segundo motor local.
Inclinação dinâmica continua indisponível no esquema anterior. Não se executou
homologação física, estudo formal de reidentificação ou benchmark de memória
em Android/iPhone. O snapshot municipal inicial cobre Alagoas; fora dele, os
pares pessoais funcionam, mas os filtros regionais exigem importação adicional.

Roteiro para Chrome Android e Safari iPhone, usando sessões sintéticas/salvas:

1. Entrar, abrir Histórico e duas sessões próprias sem rota; conferir grupo e
   correspondência integral, mapa, marcadores, comparação e retorno do Replay.
2. Usar sessão contida em outra; conferir coberturas assimétricas, tempo comum,
   média/máxima observadas e ausência de diferenças de totais parciais.
3. Testar trecho contrário, cruzamento, via paralela a 5 m, GPS impreciso, pausa
   e lacuna. Conferir bloqueios, mensagens e linhas separadas.
4. Selecionar cada trecho comum, centralizar/zoom, filtrar moto/cilindrada e
   município/UF/região; conferir navegação e legibilidade de 320 a 430 px.
5. Com duas contas, tentar IDs diretos e atividade pública sem opt-in. Com dez
   contas sintéticas, verificar agregado; revogar uma, privatizar perfil e excluir
   atividade. Não devem aparecer detalhes ou agregado abaixo do mínimo.
6. Salvar offline, recarregar, abrir Replay local, reconectar e sincronizar duas
   vezes. Aguardar análise e conferir ausência de duplicatas.
7. Monitorar memória/fluidez com 50.000 pontos e interrupção da rede/aba/API.
   Validar retomada do worker, estados de erro e reprocessamento limitado.

Nenhum cenário exige pilotagem adicional ou manobras arriscadas.

## Preparação futura, sem implementar a Parte 16

`rides.id`, `client_id`, `started_at`, timestamps GPS, intervalos ativos e
tempos relativos dos sensores permanecem intactos. Podem sustentar futuramente
uma associação explícita entre mídia local e atividade, incluindo pausas e
offset temporal. As referências derivadas têm versão e não substituem essa
linha do tempo original. Não há captura de vídeo, overlays, MP4 ou publicação.
