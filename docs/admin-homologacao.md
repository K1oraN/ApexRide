# Plano de revisão para a Parte 23

Este documento prepara a homologação; não inicia a Parte 23 nem autoriza deploy.

| Cenário         | Roteiro                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Acesso      | Conta verificada → CLI restrito → MFA → dashboard real → usuários conforme matriz → logout → confirmar revogação                                              |
| B — Denúncia    | Duas contas sintéticas → post → denúncia → atribuição → evidência → decisão → feed/URL → auditoria → recurso independente                                     |
| C — Grupo       | Grupo privado → post reportado → moderador sem vínculo → somente evidência específica → suspensão/restauração com proprietário preservado                     |
| D — Circuito    | Rascunho privado inacessível → submissão → aprovação pública → evidência de instalação fechada → verificação distinta → suspensão da verificação              |
| E — XP          | Concessão sintética legítima → revisão → pedido compensatório → negar autoaprovação → segunda aprovação → saldo/nível/ranking → confirmar original preservado |
| F — GPS social  | Evento atual → consentimento separado → posição temporária → cancelamento administrativo → sessão revogada/posição eliminada → negar reutilização             |
| G — Privacidade | Pedido do titular → verificar identidade → processar → responder providência real → conferir isolamento e ausência de exportação indiscriminada               |
| H — Incidente   | Registrar → analisar → conter com revogação → corrigir → verificar em outra sessão → encerrar com justificativa                                               |

Validar Chrome e Edge desktop, Firefox aplicável, Chrome Android e Safari iPhone
reais. Os testes automatizados em Chrome desktop e viewports móveis não homologam
aparelhos físicos. Cobrir teclado, foco, formulários, confirmação em duas etapas,
perda de rede, expiração durante uma decisão, troca de conta, volta de aba oculta
e revogação simultânea em outro aparelho.

Revisões necessárias antes de lançamento:

- Pentest independente: IDOR/BOLA, escopo de evidência, escalada, CSRF, sessões,
  XSS armazenado, rate limits distribuídos, recuperação e trilha de auditoria.
- Carga representativa com centenas de milhares de registros, EXPLAIN dos índices,
  contenção dos locks administrativos e orçamento do dashboard. O teste local com
  milhares de contas não equivale a esse ensaio.
- Backup/restauração de PostgreSQL/PostGIS e armazenamento de mídia, exclusão dos
  dados de posições efêmeras, preservação segura da chave MFA e restauração ensaiada.
- Credencial de aplicação com privilégios mínimos; migrações com credencial separada;
  retenção/arquivo da auditoria e ancoragem externa da cadeia.
- Reverse proxy/TLS, CSP da página `/admin`, CORS da origem definitiva, cookies
  Secure, proteção do host, SMTP, monitoramento e resposta a incidentes.
- Revisão responsável de textos jurídicos, finalidades, retenção, atendimento aos
  titulares, recuperação sem códigos e critérios documentais de circuito fechado.

Nenhum resultado de pista foi homologado; ranking público de tempos continua
indisponível conforme o limite técnico da Parte 21. Não criar competição em vias
públicas durante a homologação. Pagamentos, marketplace, chat e streaming continuam
fora do escopo.
