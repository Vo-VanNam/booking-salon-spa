import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { isValidVnPhone } from '../common/validators/vn-phone';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUserInfo } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const INVALID_SESSION_MESSAGE =
  'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại';
const INVALID_CREDENTIALS_MESSAGE =
  'Số điện thoại/email hoặc mật khẩu không đúng';
const PHONE_INVALID_MESSAGE =
  'Số điện thoại không hợp lệ (yêu cầu 10 số, đầu 03/05/07/08/09)';
const EMAIL_INVALID_MESSAGE = 'Email không hợp lệ';
const PASSWORD_TOO_SHORT_MESSAGE = 'Mật khẩu tối thiểu 8 ký tự';
const PHONE_EXISTS_MESSAGE = 'Số điện thoại đã được đăng ký';
const EMAIL_EXISTS_MESSAGE = 'Email đã được đăng ký';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

interface TokenUser {
  id: string;
  role: UserRole;
  branchId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserInfo;
  }> {
    this.validateCredentials(dto.phone, dto.email, dto.password);
    await this.assertPhoneAvailable(dto.phone);
    if (dto.email !== undefined) {
      await this.assertEmailAvailable(dto.email);
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { name: dto.name, phone: dto.phone, email: dto.email },
      });
      return tx.user.create({
        data: {
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          role: UserRole.customer,
          customerId: customer.id,
        },
      });
    });

    return this.issueTokens(user, dto.name);
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserInfo;
  }> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: dto.phoneOrEmail }, { email: dto.phoneOrEmail }],
      },
      include: { customer: true, stylist: true },
    });
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    const passwordOk = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    if (!user.active) {
      throw new ForbiddenException('Tài khoản đã bị khóa');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const name = this.resolveName(user);
    return this.issueTokens(user, name);
  }

  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserInfo;
  }> {
    const hash = sha256(refreshToken);
    const user = await this.prisma.user.findFirst({
      where: { refreshTokenHash: hash },
      include: { customer: true, stylist: true },
    });
    if (!user) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }
    // Reuse detection: token hiện tại không khớp hash đã lưu là dấu hiệu token
    // cũ bị dùng lại sau rotation → thu hồi phiên, bắt đăng nhập lại.
    if (user.refreshTokenHash !== hash) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const newRefreshToken = generateRefreshToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: sha256(newRefreshToken) },
    });
    const accessToken = await this.signAccessToken(user);
    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        name: this.resolveName(user),
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    const hash = sha256(refreshToken);
    const user = await this.prisma.user.findFirst({
      where: { refreshTokenHash: hash },
    });
    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
    }
    return { success: true };
  }

  async getMe(userId: string): Promise<{
    id: string;
    phone: string | null;
    email: string | null;
    role: UserRole;
    branchId: string | null;
    customerId: string | null;
    stylistId: string | null;
    name: string | null;
    active: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true, stylist: true },
    });
    if (!user) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      customerId: user.customerId,
      stylistId: user.stylistId,
      name: this.resolveName(user),
      active: user.active,
    };
  }

  private validateCredentials(
    phone: string,
    email: string | undefined,
    password: string,
  ): void {
    if (!isValidVnPhone(phone)) {
      throw new BadRequestException(PHONE_INVALID_MESSAGE);
    }
    if (password.length < 8) {
      throw new BadRequestException(PASSWORD_TOO_SHORT_MESSAGE);
    }
    if (email !== undefined && !this.isEmail(email)) {
      throw new BadRequestException(EMAIL_INVALID_MESSAGE);
    }
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private async assertPhoneAvailable(phone: string): Promise<void> {
    const [existingUser, existingCustomer] = await Promise.all([
      this.prisma.user.findUnique({ where: { phone } }),
      this.prisma.customer.findUnique({ where: { phone } }),
    ]);
    if (existingUser || existingCustomer) {
      throw new ConflictException(PHONE_EXISTS_MESSAGE);
    }
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(EMAIL_EXISTS_MESSAGE);
    }
  }

  private resolveName(user: {
    customer?: { name: string } | null;
    stylist?: { name: string } | null;
  }): string | null {
    return user.customer?.name ?? user.stylist?.name ?? null;
  }

  private async signAccessToken(user: TokenUser): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        role: user.role,
        branchId: user.branchId ?? undefined,
      },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<number>('jwt.accessTtl'),
      },
    );
  }

  private async issueTokens(
    user: User,
    name: string | null,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: AuthUserInfo;
  }> {
    const refreshToken = generateRefreshToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: sha256(refreshToken) },
    });
    const accessToken = await this.signAccessToken(user);
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    };
  }
}
