import { Module } from '@nestjs/common';
import { ResendModule } from 'nest-resend';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

@Module({
    imports: [
        ResendModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                apiKey: configService.get('RESEND_API_KEY'),
            }),
        }),
    ],
    providers: [MailService],
    exports: [MailService],
})
export class MailModule { }