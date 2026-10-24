# Provisionamento e recuperação administrativa

## Primeiro acesso

1. Execute as migrações locais com `pnpm db:migrate`.
2. Configure `ADMIN_MFA_KEY` somente no servidor: 32 bytes aleatórios em hexadecimal
   (64 caracteres), gerados e guardados por ferramenta segura de gestão de
   segredos. Não reutilize senha de conta, chave de sessão nem variável `VITE_`.
3. Cadastre uma conta comum pelo fluxo existente e confirme seu e-mail. Não há
   conta administrativa automática, senha padrão ou promoção do primeiro cadastro.
4. No terminal **local e confiável do operador da implantação**, execute:

   ```powershell
   pnpm admin:bootstrap bootstrap <UUID-da-conta-verificada>
   ```

5. Digite a senha atual na entrada oculta e confirme `PROVISIONAR`. O CLI não
   aceita senha em argumento, não imprime credenciais e registra o provisionamento.
   Uma trava transacional e o registro singleton impedem repetir o bootstrap.
6. Entre normalmente e abra `/admin`. A concessão permanece **pendente de MFA**
   para fins operacionais: nenhuma API privilegiada abre até completar TOTP.
7. Confirme senha, adicione a chave no aplicativo autenticador e informe o código.
   Guarde os oito códigos de recuperação exibidos uma vez. Não compartilhe capturas.

O procedimento pressupõe controle confiável do host e do banco pelo operador de
implantação. Não substitui o processo organizacional de autorização. A tarefa
não provisiona contas reais nem configura chaves automaticamente.

## Outros operadores

Em `/admin/operators`, o superadministrador informa uma conta existente,
verificada, papel, operação e justificativa. Papéis comuns são concedidos ou
revogados com MFA recente. A sessão administrativa do destinatário é invalidada;
ele precisa configurar/confirmar seu próprio autenticador.

Para criar outro superadministrador, primeiro estabeleça um auditor independente.
Solicite a concessão para uma terceira conta e peça a revisão na fila
`/admin/approvals`. O solicitante, aprovador e destinatário não podem concentrar
o fluxo em si mesmos. Revogar o último superadministrador efetivo é recusado.

## MFA e sessões

TOTP usa OTPAuth 9.4.1, SHA-1, seis dígitos e passos de 30 segundos, com janela
adjacente de um passo e bloqueio de reutilização por contador. A implementação
usa a [biblioteca e recomendações do mantenedor](https://github.com/hectorm/otpauth).
O segredo é cifrado com AES-256-GCM do Node, nonce aleatório e identidade como
dado autenticado. Os códigos de recuperação são aleatórios, hasheados e de uso
único. Tentativas são limitadas por conta no PostgreSQL; login existente também
possui limitação de IP/identidade.

Sessão privilegiada: 30 minutos absolutos, vinculada à sessão comum. Ações críticas
exigem senha e MFA confirmados nos últimos cinco minutos. Logout comum, expiração,
troca de senha e revogação de acesso impedem uso da sessão privilegiada. Alterações
de papéis invalidam sessões administrativas imediatamente. Autorizações são
consultadas de novo; não dependem de claims antigas. Não há senha paralela.

## Recuperação

Com senha e um código de recuperação ainda válido, selecione **Usar código de
recuperação** na tela de MFA. O consumo é transacional e auditado; reutilização
falha. Em suspeita de comprometimento, revogue sessões antes de retomar operações.

Perda de autenticador **e** de todos os códigos exige atendimento fora do painel:
verificação documental proporcional por responsáveis designados, duas pessoas
para autorizar intervenção operacional, registro de incidente e auditoria pelo
operador confiável do banco. Não há reset remoto irrestrito nem conta secreta.
A troca assistida do autenticador e rotação/recriptografia de `ADMIN_MFA_KEY`
ainda exigem procedimento operacional supervisionado; não foram automatizadas.
Preserve a chave em backup protegido: perdê-la torna os segredos TOTP ilegíveis.

Antes da produção: validar NTP, SMTP real, TLS, cookies Secure, secret manager,
política de recuperação, segregação de papéis do PostgreSQL e restauração da chave.
