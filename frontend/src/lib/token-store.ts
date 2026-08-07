// Quyết định thiết kế (plan, mục 7): access token giữ trong memory để chống
// XSS đánh cắp, refresh token trong localStorage để sống qua lần tải lại trang.
// Tradeoff: mất access token khi F5 → api client tự refresh bằng refresh token.
const REFRESH_KEY = "salon_refresh_token";

let accessToken: string | null = null;

export interface StoredUser {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: string;
}

let currentUser: StoredUser | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(
  access: string,
  refresh: string,
  user?: StoredUser,
): void {
  accessToken = access;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(REFRESH_KEY, refresh);
  }
  if (user) currentUser = user;
}

export function clearTokens(): void {
  accessToken = null;
  currentUser = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REFRESH_KEY);
  }
}

export function getStoredUser(): StoredUser | null {
  return currentUser;
}
