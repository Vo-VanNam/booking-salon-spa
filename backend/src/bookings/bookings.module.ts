import { Module } from '@nestjs/common';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { RemindersModule } from '../reminders/reminders.module';
import { SlotEngineService } from '../slots/slot-engine.service';
import { SlotsModule } from '../slots/slots.module';
import { TimeService } from '../time/time.service';
import { AdminBookingsController } from './admin-bookings.controller';
import { BookingsController } from './bookings.controller';
import { BookingService } from './bookings.service';

@Module({
  imports: [SlotsModule, LoyaltyModule, RemindersModule],
  controllers: [BookingsController, AdminBookingsController],
  providers: [BookingService, SlotEngineService, TimeService],
  exports: [BookingService],
})
export class BookingsModule {}
