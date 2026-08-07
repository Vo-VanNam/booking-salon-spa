import { Module } from '@nestjs/common';
import { TimeService } from '../time/time.service';
import { SlotCacheService } from './slot-cache.service';
import { SlotEngineService } from './slot-engine.service';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({
  controllers: [SlotsController],
  providers: [SlotsService, SlotCacheService, SlotEngineService, TimeService],
  exports: [SlotsService, SlotCacheService],
})
export class SlotsModule {}
