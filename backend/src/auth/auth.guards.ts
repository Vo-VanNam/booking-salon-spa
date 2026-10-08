import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Guard xác thực toàn cục: route không đánh dấu @Public() bắt buộc Bearer token hợp lệ.
 * Route @Public() vẫn gắn user nếu token hợp lệ (để dùng @CurrentUser tuỳ chọn).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = extractBearerToken(request);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Vui lòng đăng nhập để tiếp tục.');
    }

    const user = await this.verify(token);
    if (!user) {
      if (isPublic) return true;
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    request.user = user;
    return true;
  }

  private async verify(token: string): Promise<AuthUser | null> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; role: Role }>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          fullName: true,
          branchId: true,
          stylistId: true,
          customerId: true,
          isActive: true,
        },
      });
      if (!user || !user.isActive) return null;
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        branchId: user.branchId,
        stylistId: user.stylistId,
        customerId: user.customerId,
      };
    } catch {
      return null;
    }
  }
}

/** Guard phân quyền theo role; route không có @Roles() thì chỉ cần đăng nhập (nếu không @Public). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!request.user) throw new UnauthorizedException('Vui lòng đăng nhập để tiếp tục.');
    if (!requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('Bạn không có quyền truy cập chức năng này.');
    }
    return true;
  }
}
