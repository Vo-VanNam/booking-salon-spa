import { Module } from '@nestjs/common';
import { StylistSelfController } from './stylist-self.controller';
import { StylistsController } from './stylists.controller';
import { StylistsService } from './stylists.service';

@Module({
  controllers: [StylistsController, StylistSelfController],
  providers: [StylistsService],
  exports: [StylistsService],
})
export class StylistsModule {}
