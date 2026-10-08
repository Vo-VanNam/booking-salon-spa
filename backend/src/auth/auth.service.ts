import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { serverConfig } from '../common/config';
import { AppLogger } from '../common/logger';
import { normalizeEmail } from '../common/validators';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser } from './auth.decorators';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    email: string;
    role: string;
    name: string;
    branch_id: string | null;
    stylist_id: string | null;
    customer_id: string | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new AppLogger('auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string, userAgent?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    const invalid = new UnauthorizedException('Email hoặc mật khẩu không đúng.');

    if (!user || !user.isActive) {
      // So sánh giả để thời gian phản hồi không tiết lộ tài khoản có tồn tại hay không.
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
      throw invalid;
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) throw invalid;

    const tokens = await this.issueTokens(user, userAgent);
    this.logger.log('Đăng nhập thành công', { user_id: user.id, role: user.role });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.fullName,
        branch_id: user.branchId,
        stylist_id: user.stylistId,
        customer_id: user.customerId,
      },
    };
  }

  /** Refresh token luân chuyển: token cũ bị thu hồi, token mới được phát hành (revocable, DOCUMENT.md §5). */
  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() <= Date.now() || !stored.user.isActive) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    const tokens = await this.issueTokens(stored.user, userAgent);
    const replacement = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(tokens.refresh_token) } });
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: replacement?.id ?? null },
    });
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        branchId: true,
        stylistId: true,
        customerId: true,
        branch: { select: { id: true, name: true } },
        stylist: { select: { id: true, name: true, branchId: true } },
      },
    });
    return {
      id: record?.id,
      email: record?.email,
      role: record?.role,
      name: record?.fullName,
      branch_id: record?.branchId ?? null,
      branch_name: record?.branch?.name ?? null,
      stylist_id: record?.stylistId ?? null,
      stylist_name: record?.stylist?.name ?? null,
      customer_id: record?.customerId ?? null,
    };
  }

  private async issueTokens(user: User, userAgent?: string): Promise<TokenPair> {
    const config = serverConfig();
    const accessTtl = config.accessTtl;
    const access_token = await this.jwtService.signAsync(
      { sub: user.id, role: user.role, email: user.email, branchId: user.branchId },
      { expiresIn: accessTtl },
    );

    const refresh_token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refresh_token),
        expiresAt,
        userAgent: userAgent?.slice(0, 200),
      },
    });

    return { access_token, refresh_token, expires_in: this.parseTtlSeconds(accessTtl) };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseTtlSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])?$/.exec(ttl.trim());
    if (!match) return 900;
    const value = Number.parseInt(match[1], 10);
    switch (match[2]) {
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86_400;
      case 's':
      default:
        return value;
    }
  }
}
