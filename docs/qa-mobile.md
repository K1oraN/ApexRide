# Compatibilidade, recursos físicos e limites

Data: 23/10/2026. **Não testado em aparelho real.** Chrome desktop com viewport
mobile e APIs simuladas não comprova funcionamento em Android ou iPhone.

| Plataforma                      | Modelo/SO/navegador                      | GPS         | Sensores / assistido | Vídeo / exportação                         | Offline / PWA                   | Resultado                      |
| ------------------------------- | ---------------------------------------- | ----------- | -------------------- | ------------------------------------------ | ------------------------------- | ------------------------------ |
| Windows desktop                 | Host de desenvolvimento, Chrome headless | Simulado    | Simulados            | Captura/Canvas/MediaRecorder automatizados | IndexedDB e shell automatizados | Evidência de navegador desktop |
| Android intermediário           | Não disponibilizado                      | Não testado | Não testado          | Não testado                                | Não testado                     | Pendente                       |
| Android superior                | Não disponibilizado                      | Não testado | Não testado          | Não testado                                | Não testado                     | Pendente                       |
| iPhone Safari                   | Não disponibilizado                      | Não testado | Não testado          | Não testado                                | Não testado                     | Pendente                       |
| iPhone PWA instalada            | Não disponibilizado                      | Não testado | Não testado          | Não testado                                | Não testado                     | Pendente                       |
| Firefox / Edge / Safari desktop | Não executados nesta auditoria           | Não testado | Não testado          | Não testado                                | Não testado                     | Pendente                       |

Responsividade automatizada: 320, 360, 375, 390, 430, 768 e 1440 px nas páginas
principais, além dos fluxos específicos dos módulos. Capturas são artefatos
locais de teste; as quatro referências originais não foram localizadas nesta
rodada. Preservaram-se tokens, cores, layout, velocímetro circular e cinco abas,
sem afirmar nova aprovação visual pixel a pixel.

## Homologação da Etapa 5 — roteiro e registro pendentes

Executar separadamente em Android intermediário, Android superior, iPhone Safari
e iPhone PWA. Nenhum desses aparelhos foi disponibilizado nesta etapa. Preencher
modelo, SO/navegador/versão, data, responsável e evidência por caso; os resultados
de Chrome desktop com GPS/sensores/câmera sintéticos são outra categoria.

1. Com a moto parada, conferir preparo em retrato/paisagem, botão Iniciar,
   navegação com cinco abas, safe areas, foco, TalkBack/VoiceOver e texto ampliado.
2. Negar/conceder GPS. Aguardar posição válida; conferir ausência de timer antes
   do início, velocidade ausente diferente de zero e qualidade/fonte indicadas.
3. Em trajeto a pé seguro, comparar distância e tempo com referência independente,
   pausar/retomar e navegar entre páginas. Não testar manobras de desempenho.
4. Verificar cada canal do diagnóstico: construtor sem eventos, só aceleração,
   giro/orientação nulos, leituras recentes e expiração. GPS deve continuar sozinho.
5. Em suporte fixo e parado, testar as duas montagens, confirmação vertical,
   estabilidade/rejeição/recalibração. Rodar tela, interromper eventos e retirar
   referência; G fica indisponível, inclinação dinâmica sempre indisponível.
6. GPS Assistido: comparar fonte e fallback, negar sensores, perder calibração,
   observar lacunas. Somente referência metrológica independente pode homologar
   precisão dinâmica; a aparência do velocímetro não constitui essa evidência.
7. Câmeras frontal/traseira, apenas uma ativa; áudio desligado/consentido,
   REC após início confirmado, pausa encerrando arquivo e retomada em segmento
   novo. Troca de câmera somente durante pausa, com a moto parada.
8. Negar/revogar câmera/microfone, receber chamada, mudar app, bloquear tela,
   ocultar página. Conferir mensagem, preservação dos blocos confirmados,
   liberação de recursos e ausência de falsa gravação em segundo plano.
9. Espaço reduzido/quota, IndexedDB indisponível, rede ausente, reload inesperado,
   recuperação após lease. Conferir só checkpoints, lacunas e sincronização única.
10. Biblioteca/estúdio: reproduzir originais e segmentos, testar seek/taxas,
    offset e layouts, ausências de telemetria, cancelamento, codec recusado,
    exportação WebM/MP4 apenas quando oferecida e áudio explicitamente escolhido.
    Abrir composto em player externo, conferir frames e ouvir início/meio/fim.
11. Outra conta no mesmo aparelho não pode acessar arquivos anteriores. Excluir
    exige confirmação, não remove outra atividade nem publica localização.
12. Em bancada, registrar consumo/aquecimento durante sessões de duração conhecida,
    versão, brilho, conexão, câmera/qualidade, carga inicial/final e interrupções.
    Não inferir autonomia móvel do benchmark sintético de Node.

Circuitos: conferir linha/sentido/geometria/versionamento com registros sintéticos
e referência independente em ambiente autorizado. Não executar testes físicos
perigosos de aceleração ou frenagem em vias públicas. Voltas permanecem estimadas.

## Roteiro obrigatório em cada aparelho

Registrar fabricante/modelo, SO, versão do navegador, modo Safari/PWA, conexão,
permissões e resultado individual com evidências autorizadas e sanitizadas.

1. HTTPS, cadastro/login, recuperação de conta, perfil privado e Garagem/foto.
2. GPS negado/concedido, imprecisão, envelhecimento do sinal e mapa sem tiles.
3. Moto parada e montada: sensores opcionais, calibração, falha, troca de
   orientação, GPS Assistido e fallback para GPS Puro. Nunca conduzir testes
   perigosos de aceleração/frenagem em vias públicas.
4. Passeio, Pista e Misto: iniciar, pausar, retomar, finalizar, salvar, descartar,
   conferir distância/tempo e consultar Histórico/Replay.
5. Rede ausente antes/durante Ride, recarregar, fechar inesperadamente, reabrir,
   recuperar só pontos confirmados e sincronizar sem duplicar Ride/XP.
6. Câmeras frontal/traseira, áudio opcional, pausa, segmentos, quota, recuperação,
   playback e cópia original; overlay/exportação somente em codec reproduzível.
7. Comunidade, grupo privado, convite, evento e GPS social com duas contas:
   consentir, limitar público/prazo, parar, remover participante, bloquear,
   cancelar evento e confirmar TTL/revogação; sem retomada automática offline.
8. Tela bloqueada, troca de app, chamada, revogação de permissão e pouco espaço.
   Conferir interrupções explícitas e liberação de câmera/GPS/listeners.
9. Instalação e atualização da PWA, safe areas, teclado virtual, foco, leitura
   por TalkBack/VoiceOver, contraste e controles sem sobreposição.

## Limites confirmados pela implementação

- GPS/câmera precisam de contexto seguro e permissões. Sensores opcionais não
  bloqueiam o Ride básico. Sem dados válidos, o sistema deve mostrar indisponível.
- Inclinação dinâmica permanece indisponível até homologação; G e velocidade
  assistida são estimativas, sem certificação de instrumentação da motocicleta.
- GPS Assistido depende de GPS recente, calibração e sensores válidos; não é
  substituição ilimitada do GPS. Eventos/voltas são estimados e não cronometragem
  oficial. Não existe ranking público de velocidade em vias comuns.
- PWA não garante GPS, câmera ou exportação em segundo plano, tela bloqueada,
  navegador suspenso/fechado. Lacunas não devem receber posições inventadas.
- Vídeos/exports são locais por conta; o servidor não recebe esses arquivos.
  Evicção de armazenamento ou limpeza de dados do navegador pode removê-los.
- Reprodução/cópia de segmento usa limite de 256 MiB; export composto tem limite
  de 128 MiB e ocorre em tempo real, com página ativa e suporte a codecs/Canvas.
  Não há promessa de MP4, áudio preservado ou 1080p longo em todo navegador.
- Tiles de mapa exigem rede e expõem região visualizada ao provedor. O shell
  offline não significa mapa offline completo. OSRM é dependência separada.
- GPS social começa desligado e exige consentimento separado. Há posição atual
  temporária, público definido e TTL de 30 s; não há fila social de coordenadas.
- Exclusão de Ride é lógica com tombstone para impedir reenvio atrasado; não é
  expurgo físico de todas as cópias e backups.

Os manuais por módulo detalham o uso: [sessões](sessoes.md), [offline](offline.md),
[GPS](gps.md), [sensores](sensores.md), [assistido](gps-assistido.md),
[vídeos](videos.md), [overlay](video-overlay.md), [eventos](eventos.md) e
[administração](admin-homologacao.md). Nenhum resultado desktop deve preencher
uma célula de dispositivo físico como aprovado.
