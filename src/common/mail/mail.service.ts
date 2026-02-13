import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private readonly fromEmail: string;
    private readonly fromName: string;

    private resend: Resend;

    constructor(
        private readonly configService: ConfigService,
    ) {
        this.resend = new Resend(this.configService.get('RESEND_API_KEY'));
        this.fromEmail = this.configService.get('RESEND_FROM_EMAIL');
        this.fromName = this.configService.get('RESEND_FROM_NAME');
    }

    async sendWelcomeEmail(email: string, name: string) {
        try {
            await this.resend.emails.send({
                from: `${this.fromName} <${this.fromEmail}>`,
                to: email,
                subject: 'Bem-vindo ao Sistema',
                html: `<h1>Olá ${name}!</h1><p>Bem-vindo ao nosso sistema.</p>`,
            });

            this.logger.log(`Welcome email sent to ${email}`);
        } catch (error) {
            this.logger.error(`Failed to send email to ${email}`, error);
            throw error;
        }
    }

    async sendPasswordReset(email: string, token: string) {
        const resetUrl = `${this.configService.get('APP_URL')}/reset-password?token=${token}`;

        try {
            await this.resend.emails.send({
                from: `${this.fromName} <${this.fromEmail}>`,
                to: email,
                subject: 'Redefinição de Senha',
                html: `
          <h2>Redefinição de Senha</h2>
          <p>Clique no link abaixo para redefinir sua senha:</p>
          <a href="${resetUrl}">Redefinir Senha</a>
          <p>Este link expira em 1 hora.</p>
        `,
            });

            this.logger.log(`Password reset email sent to ${email}`);
        } catch (error) {
            this.logger.error(`Failed to send password reset to ${email}`, error);
            throw error;
        }
    }
}