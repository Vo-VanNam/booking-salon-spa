import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimeService } from '../time/time.service';
import { LoyaltyProcessor } from './loyalty.processor';
import { LoyaltyService } from './loyalty.service';
import { LOYALTY_QUEUE } from './loyalty.types';

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
    BullModule.registerQueue({ name: LOYALTY_QUEUE }),
  ],
  providers: [LoyaltyService, LoyaltyProcessor, TimeService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
