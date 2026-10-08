import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimit } from '../common/rate-limit.guard';
import { AuthUser, CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({ key: 'auth-login', limit: 20, windowSeconds: 60 })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto.email, dto.password, request.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RateLimit({ key: 'auth-refresh', limit: 60, windowSeconds: 60 })
  refresh(@Body() dto: RefreshDto, @Req() request: Request) {
    return this.authService.refresh(dto.refresh_token, request.headers['user-agent']);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refresh_token);
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }
}
