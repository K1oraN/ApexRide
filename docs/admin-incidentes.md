# Resposta a incidentes e privacidade

Registre categoria, gravidade e descrição mínima em `/admin/incidents`. Não copie
senhas, tokens, fotografias ou coordenadas para o incidente. O backend exige
sequência: recebido → análise → contenção → correção → verificação → encerrado.
Versões impedem atualizações concorrentes; cada transição exige providência
documentada e gera auditoria.

Na contenção, identifique a conta afetada por referência interna. Um operador com
`admin.sessions.revoke` pode revogar sessões comuns/administrativas e consentimentos
sociais sem consultar coordenadas. Perda de papéis é tratada na gestão de operadores.
Preserve evidências mínimas, correlação e justificativas; não apague auditoria.

Investigue extensão, público atingido, período, dados envolvidos, persistência em
cache/mídia e possível comprometimento do operador. Corrija pelo serviço do domínio,
repita testes negativos e valide revogação em outra sessão/dispositivo. Encaminhe
incidentes graves aos responsáveis técnicos e de privacidade designados. A avaliação
de comunicação aos titulares/autoridades cabe aos responsáveis competentes; este
software não decide obrigações jurídicas automaticamente.

`/admin/security` agrega ações/negações das últimas 24 horas e sessões privilegiadas
válidas. Não é um SIEM, não infere fraude automaticamente e não mostra IPs ou
trajetórias. Falhas técnicas gerais também precisam do monitoramento externo da
implantação, que não foi configurado nesta parte.

Solicitações do titular em `/perfil/medidas` entram em `/admin/privacy`. O operador
registra verificação de identidade antes de avançar a processamento/conclusão.
O botão confirma a realização do procedimento operacional: não é validação
documental automática. A resposta deve descrever somente providências realmente
executadas. A ferramenta acompanha acesso, correção, exclusão, consentimentos,
exportação individual e dúvidas; não cria exportador de banco nem expurgo físico
automático. Backups e vídeos locais precisam de tratamento próprio.

Retenção: o ledger, decisões e auditoria são protegidos de alterações comuns.
Casos referenciam a evidência existente sem duplicar GPS/mídia. Não foi ativada
limpeza automática de registros administrativos antes de uma política formal
de retenção, base jurídica e arquivo supervisionado. Isso é pendência operacional,
não promessa de retenção indefinida nem de conformidade integral com a LGPD.
Os TTLs existentes do GPS social permanecem válidos. O responsável deve definir
prazos, acesso ao arquivo, restrições de backup, eliminação proporcional e revisão
periódica antes do lançamento.

O encadeamento SHA-256 ajuda a detectar adulterações e triggers bloqueiam
UPDATE/DELETE/TRUNCATE comuns da auditoria. O proprietário do banco pode desativar
triggers e recalcular a cadeia. Use credencial de aplicação sem privilégios de
DDL, cópia externa com controle de acesso e ancoragem independente antes da
produção; não se trata de imutabilidade criptográfica contra o dono do banco.
