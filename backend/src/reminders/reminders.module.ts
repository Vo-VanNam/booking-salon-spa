import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { RemindersProcessor } from './reminders.processor';
import { RemindersService } from './reminders.service';
import { REMINDERS_QUEUE } from './reminders.types';
import { SMS_PROVIDER, smsProviderFactory } from './sms.provider';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        );
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
  ],
  providers: [
    RemindersService,
    RemindersProcessor,
    MailService,
    {
      provide: SMS_PROVIDER,
      useFactory: smsProviderFactory,
      inject: [ConfigService],
    },
  ],
  exports: [RemindersService],
})
export class RemindersModule {}
