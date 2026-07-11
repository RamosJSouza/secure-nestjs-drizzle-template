import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EMAIL_PROVIDER } from './ports/email-provider.port';
import { NodemailerAdapter } from './adapters/nodemailer.adapter';
import { MailFacade } from './mail.facade';

@Module({
  imports: [ConfigModule],
  providers: [
    NodemailerAdapter,
    { provide: EMAIL_PROVIDER, useExisting: NodemailerAdapter },
    MailFacade,
  ],
  exports: [MailFacade],
})
export class MailModule {}
