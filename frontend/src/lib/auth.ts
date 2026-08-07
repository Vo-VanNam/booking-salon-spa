import { ApiError, apiPost } from "./api";
import { clearTokens, getRefreshToken } from "./token-store";

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Quản trị viên",
  branch_admin: "Quản lý chi nhánh",
  stylist: "Stylist",
  customer: "Khách hàng",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Trang đích sau đăng nhập theo vai trò. */
export function homePathForRole(role: string): string {
  if (role === "super_admin" || role === "branch_admin") return "/admin";
  if (role === "stylist") return "/stylist";
  return "/dat-lich";
}

/** Đăng xuất: thu hồi refresh token trên server rồi xóa phiên cục bộ. */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await apiPost("/auth/logout", { refreshToken }, true);
    } catch (error) {
      // Phiên đã hết hạn cũng không ngăn đăng xuất cục bộ.
      if (!(error instanceof ApiError)) throw error;
    }
  }
  clearTokens();
}
