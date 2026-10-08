import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { BookingsModule } from '../bookings/bookings.module';
import { SlotsModule } from '../slots/slots.module';
import { AiController } from './ai.controller';
import { AiHistoryService } from './ai-history.service';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';
import { AnalyticsToolRegistry, CustomerToolRegistry } from './tools/tool-registry';

@Module({
  imports: [SlotsModule, BookingsModule, AdminModule],
  controllers: [AiController],
  providers: [AiService, AiHistoryService, LlmClient, CustomerToolRegistry, AnalyticsToolRegistry],
  exports: [AiService],
})
export class AiModule {}
