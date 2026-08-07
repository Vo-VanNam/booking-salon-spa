import { Module } from '@nestjs/common';
import { MomoIpnController } from './momo-ipn.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { VnpayIpnController } from './vnpay-ipn.controller';

// PrismaModule là @Global nên không cần import
@Module({
  controllers: [PaymentsController, VnpayIpnController, MomoIpnController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
