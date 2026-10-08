import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.decorators';

const STAFF_ROLES = ['branch_admin', 'super_admin'] as const;

export function isStaff(user: AuthUser): boolean {
  return STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number]);
}

/**
 * Phân quyền theo chi nhánh (DOCUMENT.md §2.6): branch_admin chỉ thao tác/xem dữ liệu chi nhánh mình,
 * super_admin toàn chuỗi.
 */
export function assertBranchAccess(user: AuthUser, branchId: string | null | undefined): void {
  if (user.role === 'super_admin') return;
  if (!branchId || user.branchId !== branchId) {
    throw new ForbiddenException('Bạn chỉ có quyền truy cập dữ liệu của chi nhánh mình phụ trách.');
  }
}

/** Chi nhánh mà người dùng được phép xem; null = toàn chuỗi (chỉ super_admin). */
export function resolveBranchScope(user: AuthUser, requestedBranchId?: string | null): string | null {
  if (user.role === 'super_admin') return requestedBranchId ?? null;
  assertBranchAccess(user, requestedBranchId ?? user.branchId);
  return user.branchId;
}
