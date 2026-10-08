import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { serverConfig } from '../common/config';
import { AppLogger } from '../common/logger';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const config = serverConfig();
if (!config.jwtSecret) {
  // Không có secret trong env: vẫn khởi động được, nhưng phiên sẽ mất khi restart.
  new AppLogger('auth').warn('JWT_SECRET chưa được cấu hình — dùng secret tạm cho phiên này');
}

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: config.jwtSecret || randomBytes(32).toString('hex'),
      signOptions: { expiresIn: config.accessTtl },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
