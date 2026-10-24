# GPS Puro e mapa em tempo real — Parte 05

Acesse `/ride` e toque em **Ativar GPS**. Não exige login ou moto cadastrada.
Autorize a localização no navegador e no sistema. **Encerrar GPS**, sair do Ride
ou descarregar a página encerra o monitoramento e descarta os dados da prévia.
Esse comportamento descreve a prévia sem sessão. Na Parte 06, usuários com moto
cadastrada também podem iniciar sessões, pausar/retomar e salvar após revisar o
resumo. Nesse caso a coleta é preservada na navegação interna, com controle acima
das páginas; o limite de 2.000 pontos se aplica somente à prévia. Veja o
[manual atual de sessões](sessoes.md). Sensores e câmera continuam indisponíveis.
Não houve deploy.

## Arquitetura e dados

| Módulo                                                     | Responsabilidade                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/services/gps/geolocation.ts`                          | Um `watchPosition`, `clearWatch` e proteção contra callbacks de inscrições encerradas              |
| `src/services/gps/config.ts`                               | Opções do navegador e limites conservadores centralizados                                          |
| `src/services/gps/readings.ts`                             | `LocationReading`, normalização sem arredondamento, conversão de velocidade, distância e validação |
| `src/services/gps/track.ts`                                | Segmentos temporários, lacunas e limite de memória                                                 |
| `src/services/gps/preview.ts`                              | Estado da prévia, permissões, interrupções e limpeza de recursos                                   |
| `src/hooks/useGpsPreview.ts`                               | Ponte React por `useSyncExternalStore`, com encerramento ao desmontar                              |
| `src/components/maps/RideMap.tsx` e `rideMapController.ts` | Uma instância MapLibre, fontes GeoJSON, câmera e marcador                                          |
| `src/components/maps/previewGeometry.ts`                   | Linha por segmentos e polígono aproximado da precisão horizontal                                   |
| `src/components/telemetry/GpsIndicator.tsx`                | Estados textuais de GPS, sem satélites ou intensidade inventada                                    |
| `src/pages/RidePage.tsx`                                   | Integração no painel existente, com o mesmo velocímetro e container de mapa                        |

Caminhos acima relativos a `apps/web/`. `LocationReading` mantém latitude e
longitude em graus, `accuracy` em metros, `speed` em m/s ou `null`, `heading`
em graus ou `null`, altitude e precisão de altitude opcionais em metros, e o
`timestamp` original em milissegundos Unix. Campos opcionais inválidos tornam-se
`null`; zero válido continua zero. Números válidos não são arredondados para
processamento. O snapshot mantém a leitura normalizada separada de `speedKmh` e
dos textos formatados. Precisão horizontal não mede a precisão da velocidade.

O módulo GPS não depende de usuário, Garagem ou modo de pilotagem. Uma futura
camada de sessões poderá consumir leituras e segmentos e associá-los às entidades
existentes. Nesta parte não há sessão persistente, endpoint, migração, envio HTTP
de leituras, WebSocket, cache offline, analytics, logs de coordenadas, histórico,
exportação, compartilhamento, GPS Assistido ou sensores inerciais.

## Coleta, qualidade e velocidade

O navegador entrega callbacks de `watchPosition`, sem frequência garantida.
Não há polling de localização nem pedidos repetitivos para contornar permissões.
Parâmetros em `GPS_CONFIG`:

| Configuração           | Valor e motivo                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `enableHighAccuracy`   | `true`; é uma preferência e aumenta o consumo de bateria                                                            |
| `maximumAge`           | 2.000 ms; limita o uso de posição em cache pelo navegador                                                           |
| `timeout`              | 12.000 ms; falha temporária permite recuperação e tentativa manual                                                  |
| Leitura atual          | Idade inferior a 15.000 ms; tolerância de relógio futuro de até 5.000 ms                                            |
| Precisão boa           | Até 50 m, inclusive; precisão maior mostra posição com qualidade reduzida, sem velocidade nem novo ponto de traçado |
| Saltos                 | Distância por Haversine menos as incertezas dos dois pontos não pode superar 100 m/s × intervalo                    |
| Lacuna                 | Intervalo de pelo menos 15.000 ms ou interrupção explícita inicia segmento novo                                     |
| Memória                | Até 2.000 pontos entre todos os segmentos; pontos mais antigos são removidos                                        |
| Verificação de frescor | Temporizador de 1 s, sem solicitar novas posições                                                                   |

Latitude deve estar em [-90, 90], longitude em [-180, 180], precisão deve ser
finita e não negativa. Timestamp precisa ser finito, positivo e estar dentro dos
limites de idade. Timestamps iguais são ignorados como duplicatas, mesmo que o
navegador repita coordenadas diferentes; pontos fora de ordem são descartados.
Coordenadas iguais em horários diferentes são válidas para um aparelho parado.
Saltos são comparados à última posição aceita e também ao último ponto preciso,
impedindo que uma leitura de precisão reduzida conecte um salto no traçado.
São regras básicas, não map matching ou detecção infalível de erros GPS.

**km/h = m/s × 3,6**. Somente a velocidade direta da API é utilizada. Não existe
estimativa por distância, correção arbitrária, aceleração simulada ou arredondamento
da leitura original. O número do velocímetro é arredondado só para apresentação;
a escala gráfica satura no máximo visual, sem cortar o número medido. `null`,
valores inválidos, perda de sinal, erro e precisão reduzida exibem **—**. Uma
velocidade zero válida exibe **0**. Distância, duração, médias, máximas e métricas
inerciais exibem ausência de dados; não há cálculos de sessões antecipados.

## Estados e ciclo de vida

| Estado                       | Comportamento                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Desligado                    | Nenhuma coleta; explicação da finalidade e botão de ativação                                               |
| Aguardando sinal             | Ativação explícita; aguarda permissão/leitura utilizável                                                   |
| GPS disponível               | Leitura recente e precisão aceitável; velocidade pode ser nula                                             |
| Precisão reduzida            | Incerteza alta ou leitura inconsistente; sem velocidade atual nem conexão indevida da linha                |
| Sinal desatualizado          | Leitura antiga ou pelo menos 15 s sem posição atual; velocidade removida                                   |
| GPS indisponível             | Timeout ou erro temporário; callback pode recuperar o mesmo watch; permite tentar novamente sem duplicá-lo |
| Permissão negada             | Encerra recursos; informa como revisar a permissão nas configurações do site/navegador; não insiste        |
| Não suportado / requer HTTPS | Explica o problema, preservando o painel                                                                   |
| Interrompido                 | Página oculta: encerra o watch, suspende velocidade e marca lacuna                                         |

`Permissions API`, quando suportada, é consultada após ativar para observar
revogações. Não é requisito: erros de `watchPosition` continuam funcionando no
Safari e outros navegadores sem suporte a essa consulta. Callbacks atrasados e
promessas de permissão após encerramento são ignorados por geração da inscrição.
Desmontagem libera watch, listeners, timer e leituras. `pagehide` também encerra
a prévia, inclusive na navegação com cache de página.

Ao ocultar a página, o watch é encerrado. Ao retornar, apenas uma prévia que já
estava ativa retoma a inscrição, aguarda nova leitura e abre outro segmento.
Nenhuma posição intermediária é inventada. Android/Chrome e iPhone/Safari podem
suspender páginas, reduzir precisão ou deixar de fornecer velocidade/direção.
Não há garantia com tela bloqueada, em segundo plano ou numa futura PWA.
GPS requer contexto seguro, normalmente HTTPS; loopback/localhost são exceções
locais reconhecidas pelo navegador. HTTP por IP de rede local no telefone não
deve ser tratado como HTTPS.

## Mapa, configuração e privacidade

MapLibre GL JS **6.15.0**, BSD-3-Clause, com worker distribuído no build Vite.
`@types/geojson` **7946.0.16**, MIT, é dependência apenas de desenvolvimento.
O mapa fica no mesmo container `.map-ride`, respeita seus breakpoints e usa os
controles na lateral já existente. Há zoom, pan, precisão aproximada, marcador
vermelho com borda branca e uma única camada vermelha com vários segmentos.
O marcador só orienta com heading válido, GPS disponível e velocidade ≥ 1 m/s;
nos outros casos usa orientação neutra. Um marcador antigo fica atenuado e é
identificado como última posição. Círculos de incerteza acima de 10 km são omitidos
por não serem úteis nesse painel.

O centro inicial [-35.735, -9.665] é uma vista de Maceió/AL, identificado como
**Vista inicial**; nenhum marcador é criado antes da leitura autorizada.
Arrastar, gestos/zoom manuais ou os botões de zoom suspendem a câmera automática.
**Acompanhar motociclista** centraliza e restaura o acompanhamento.
Atualizações usam `setData` nas fontes GeoJSON e o mesmo marcador; não recriam o
mapa. Falha de estilo/tiles/WebGL mostra aviso e tentativa manual, sem encerrar GPS.
Ativar a coleta não depende de o mapa carregar.

Configuração pública opcional, lida no build pela raiz `.env`:

```dotenv
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/dark
```

Padrão: **OpenFreeMap Dark**, sem chave. URL e câmera estão centralizadas em
`mapConfig.ts`; um estilo próprio pode apontar a provedor licenciado ou hospedagem
própria. Não foram usadas demotiles do MapLibre nem tiles públicos diretos do OSM.
Não foi configurado provedor de imagens de satélite: a composição foi preservada
com base cartográfica real escura. Satélite licenciado continua pendente.

OpenFreeMap permite uso comercial da instância pública sem chave; não fornece
SLA. A infraestrutura é aberta (MIT), os dados OSM são ODbL e devem manter
atribuição, assim como OpenMapTiles. O controle de atribuições do MapLibre fica
visível, incluindo os créditos declarados pelo estilo/TileJSON. Provedores
alternativos devem declarar suas próprias atribuições e licenças no estilo.

Embora o Apex Ride não envie posições ao backend, carregar tiles externos
revela ao provedor a região visualizada e dados de conexão. A política do
OpenFreeMap declara logs de acesso sem IP por padrão, mas admite IP/URL em
erros e incidentes de segurança, além de possível CDN. Não há promessa de
anonimato perante o provedor. A interface informa essa dependência antes da
ativação; requisitos mais restritos podem usar hospedagem própria pela mesma URL.

Referências verificadas na implementação:

- [OpenFreeMap: integração e worker Vite](https://openfreemap.org/quick_start/)
- [OpenFreeMap: uso comercial, atribuição e ausência de SLA](https://openfreemap.org/)
- [OpenFreeMap: privacidade](https://openfreemap.org/privacy/)
- [MapLibre: atualização de GeoJSON](https://maplibre.org/maplibre-gl-js/docs/API/classes/GeoJSONSource/)
- [Geolocation: watchPosition e contexto seguro](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition)

## Roteiro físico — pendente de execução

Executar em pelo menos **um Android real com Chrome** e **um iPhone real com
Safari**. Registrar modelo, versão do sistema/navegador, data, origem HTTPS e
resultados. Estes testes não foram executados nesta entrega.

1. Abrir login, cadastro, perfil e Garagem e confirmar ausência de solicitação
   de GPS. Abrir Ride: conferir identidade visual, dados ausentes e vista inicial.
2. Tocar Ativar GPS e negar; verificar orientação de configurações e ausência de
   novas solicitações automáticas. Revisar a permissão manualmente e ativar.
3. Em local aberto e parado, verificar posição, precisão e velocidade (zero
   apenas se informado pelo dispositivo; ausência se a API retornar `null`).
4. Com aparelho fixado adequadamente e sem operar a tela durante a condução,
   observar depois o traçado e a atualização do velocímetro. Um passageiro pode
   observar; o condutor só interage parado em lugar seguro.
5. Parado, testar pan, zoom e retorno ao acompanhamento. Confirmar atribuições
   legíveis nas orientações retrato e paisagem.
6. Parado, testar precisão aproximada do sistema, perda de sinal/rede e timeout.
   GPS deve continuar independente dos tiles; velocidade antiga deve desaparecer.
7. Ocultar a aba, trocar aplicativo e bloquear/desbloquear a tela. Confirmar
   interrupção, espera por nova leitura e lacuna, sem segmento atravessando a pausa.
8. Revogar a localização durante a prévia. Confirmar encerramento e mensagem;
   conceder novamente e testar nova ativação manual.
9. Encerrar GPS e sair do Ride. Confirmar fim do indicador de uso de localização
   do navegador e ausência de retomada automática ao voltar/recarregar.
10. Conferir requests/armazenamento por depuração remota: nenhuma posição para
    API, analytics, logs ou armazenamento persistente; apenas tiles externos.

Homologação pendente: precisão/velocidade/direção dos aparelhos, UX das permissões
dos sistemas, consumo de bateria, interrupções reais e eventual provedor satélite.
Emulação automatizada não substitui essa validação. Resultados das suítes e
pendências anteriores estão no [relatório da Parte 05](parte-05.md).
