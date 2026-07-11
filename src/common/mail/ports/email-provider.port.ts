export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export type EmailTemplate = 'password-reset' | 'email-verification';

export interface EmailTemplateContext {
  'password-reset': { resetUrl: string; expiresMinutes: number };
  'email-verification': { verifyUrl: string; expiresHours: number };
}

export interface IEmailProvider {
  sendMail<T extends EmailTemplate>(
    to: string,
    subject: string,
    template: T,
    context: EmailTemplateContext[T],
  ): Promise<void>;
}
