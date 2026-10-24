import nodemailer from 'nodemailer';
import type { Config } from '../../config/env.js';
export interface AccountMail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(message: AccountMail): Promise<void>;
}
// Provedor de teste explicitamente injetável, sem endpoint HTTP ou logs de tokens.
export class TestMailer implements Mailer {
  readonly messages: AccountMail[] = [];
  async send(message: AccountMail) {
    this.messages.push(message);
  }
}
export function createMailer(config: Config): Mailer {
  if (config.auth.mailMode === 'test') {
    if (config.nodeEnv === 'production') throw new Error('SMTP obrigatório');
    return new TestMailer();
  }
  const a = config.auth;
  const transport = nodemailer.createTransport({
    host: a.smtpHost,
    port: a.smtpPort,
    secure: a.smtpSecure,
    requireTLS: !a.smtpSecure,
    auth: a.smtpUser ? { user: a.smtpUser, pass: a.smtpPass } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message) {
      await transport.sendMail({ ...message, from: a.mailFrom });
    },
  };
}
