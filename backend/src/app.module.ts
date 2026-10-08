import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/auth.guards';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { BookingsModule } from './bookings/bookings.module';
import { BranchesModule } from './branches/branches.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { AppLogger } from './common/logger';
import { LoggingInterceptor } from './common/logging.interceptor';
import { RateLimitGuard } from './common/rate-limit.guard';
import { HealthModule } from './health/health.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.service';
import { ServicesModule } from './services/services.module';
import { SlotsModule } from './slots/slots.module';
import { StylistsModule } from './stylists/stylists.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    BranchesModule,
    ServicesModule,
    StylistsModule,
    SlotsModule,
    LoyaltyModule,
    QueueModule,
    BookingsModule,
    AdminModule,
    PaymentsModule,
    AiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useFactory: () => new AllExceptionsFilter(new AppLogger('exception')) },
  ],
})
export class AppModule {}
