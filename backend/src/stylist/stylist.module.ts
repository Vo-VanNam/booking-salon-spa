import { Module } from '@nestjs/common';
import { TimeService } from '../time/time.service';
import { StylistController } from './stylist.controller';
import { StylistService } from './stylist.service';

@Module({
  controllers: [StylistController],
  providers: [StylistService, TimeService],
})
export class StylistModule {}
