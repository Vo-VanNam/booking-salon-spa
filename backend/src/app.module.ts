import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { configuration, validationSchema } from './config/configuration';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { BranchesModule } from './branches/branches.module';
import { SlotsModule } from './slots/slots.module';
import { BookingsModule } from './bookings/bookings.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { StylistModule } from './stylist/stylist.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PaymentsModule } from './payments/payments.module';
import { RemindersModule } from './reminders/reminders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
      envFilePath: '.env',
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL') ?? 60000,
          limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
        },
      ],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          genReqId: (req, res) => {
            const requestId = randomUUID();
            res.setHeader('x-request-id', requestId);
            return requestId;
          },
          level:
            config.get<string>('NODE_ENV') === 'production' ? 'info' : 'debug',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers["x-api-key"]',
              'req.body.password',
              'req.body.refreshToken',
              'req.body.oldPassword',
              'req.body.newPassword',
            ],
            censor: '[REDACTED]',
          },
          customProps: (req) => ({ requestId: (req as { id?: string }).id }),
          serializers: {
            // Không đưa body vào log cho endpoint auth/payment để tránh lộ thông tin nhạy cảm
            req: (req: IncomingMessage) => {
              const url: string = req.url ?? '';
              const body =
                url.startsWith('/api/auth') || url.startsWith('/api/payments')
                  ? undefined
                  : (req as { body?: unknown }).body;
              return {
                id: (req as { id?: string }).id,
                method: req.method,
                url,
                body,
              };
            },
          },
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    BranchesModule,
    SlotsModule,
    BookingsModule,
    AuthModule,
    AdminModule,
    StylistModule,
    LoyaltyModule,
    RemindersModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
