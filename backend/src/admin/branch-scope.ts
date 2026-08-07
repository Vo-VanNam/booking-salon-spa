import { BadRequestException, ForbiddenException } from '@nestjs/common';

export interface ScopeUser {
  role: string;
  branchId?: string | null;
}

export const FORBIDDEN_BRANCH_MESSAGE =
  'Bạn không có quyền truy cập chi nhánh này';

export function assertCanAccessBranch(user: ScopeUser, branchId: string): void {
  if (user.role === 'super_admin') return;
  if (user.role === 'branch_admin') {
    if (user.branchId === branchId) return;
    throw new ForbiddenException(FORBIDDEN_BRANCH_MESSAGE);
  }
  throw new ForbiddenException(FORBIDDEN_BRANCH_MESSAGE);
}

// branch_admin luôn dùng branch của mình (bỏ qua param); super_admin phải truyền param
export function resolveBranchId(
  user: ScopeUser,
  branchIdParam?: string,
): string {
  if (user.role === 'branch_admin') {
    if (user.branchId) return user.branchId;
    throw new BadRequestException('Thiếu chi nhánh');
  }
  if (branchIdParam) return branchIdParam;
  throw new BadRequestException('Thiếu chi nhánh');
}
