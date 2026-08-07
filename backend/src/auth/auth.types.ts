import { UserRole } from '@prisma/client';

export interface AuthUser {
  sub: string;
  role: UserRole;
  branchId?: string | null;
}

export interface AuthUserInfo {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: UserRole;
}
