import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const IS_PUBLIC_KEY = 'is_public';
export const ROLES_KEY = 'roles';

/** Route công khai (không cần Bearer token). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Route chỉ dành cho các role nhất định — luôn kèm guard role (DOCUMENT.md §5). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  branchId: string | null;
  stylistId: string | null;
  customerId: string | null;
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
