import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  EmailTemplate,
  EmailTemplateContext,
  IEmailProvider,
} from '../ports/email-provider.port';

function renderPasswordResetHtml(resetUrl: string, expiresMinutes: number): string {
  return `<h2>Password reset</h2>
<p>Use the link below to reset your password. It expires in ${expiresMinutes} minutes.</p>
<p><a href="${resetUrl}">Reset password</a></p>
<p>If you did not request this, ignore this email.</p>`;
}

function renderEmailVerificationHtml(verifyUrl: string, expiresHours: number): string {
  return `<h2>Verify your email</h2>
<p>Click the link below to verify your email address. It expires in ${expiresHours} hours.</p>
<p><a href="${verifyUrl}">Verify email</a></p>`;
}

function renderTemplate<T extends EmailTemplate>(template: T, context: EmailTemplateContext[T]): string {
  if (template === 'password-reset') {
    const ctx = context as EmailTemplateContext['password-reset'];
    return renderPasswordResetHtml(ctx.resetUrl, ctx.expiresMinutes);
  }
  const ctx = context as EmailTemplateContext['email-verification'];
  return renderEmailVerificationHtml(ctx.verifyUrl, ctx.expiresHours);
}

@Injectable()
export class NodemailerAdapter implements IEmailProvider, OnModuleInit {
  private readonly logger = new Logger(NodemailerAdapter.name);
  private transporter!: Transporter;
  private fromEmail!: string;
  private fromName!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.fromEmail = this.config.get<string>('smtp.fromEmail', 'noreply@localhost');
    this.fromName = this.config.get<string>('smtp.fromName', 'App');

    if (this.config.get<string>('env', 'development') === 'development') {
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      this.logger.log('Nodemailer configured with Ethereal test account (development)');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('smtp.host'),
      port: this.config.get<number>('smtp.port', 587),
      secure: this.config.get<number>('smtp.port', 587) === 465,
      auth: {
        user: this.config.get<string>('smtp.user'),
        pass: this.config.get<string>('smtp.pass'),
      },
    });
  }

  async sendMail<T extends EmailTemplate>(
    to: string,
    subject: string,
    template: T,
    context: EmailTemplateContext[T],
  ): Promise<void> {
    const info = await this.transporter.sendMail({
      from: `${this.fromName} <${this.fromEmail}>`,
      to,
      subject,
      html: renderTemplate(template, context),
    });

    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) {
      this.logger.log(`Ethereal email preview URL: ${preview}`);
    } else {
      this.logger.log(`Email sent (${template}) messageId=${info.messageId}`);
    }
  }
}
