import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setTokens,
  type StoredUser,
} from "./token-store";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly requestId?: string;

  constructor(message: string, statusCode: number, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

interface ErrorBody {
  statusCode?: number;
  message?: unknown;
  requestId?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: StoredUser;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
}

export interface Stylist {
  id: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  workingHours: { dayOfWeek: number; startTime: string; endTime: string }[];
}

export interface SlotResult {
  date: string;
  slots: string[];
  timezone: string;
  reason?: string;
}

export interface BookingResponse {
  id: string;
  branchId: string;
  serviceId: string;
  stylistId: string;
  customerId: string;
  startTime: string;
  endTime: string;
  status: string;
  priceAtBooking: number;
  discountAmount: number;
  depositAmount: number;
  depositStatus: string;
}

export interface DepositResponse {
  paymentUrl: string;
}

// ---------- Admin / stylist (task 16) ----------

export interface MeResponse {
  id: string;
  phone: string | null;
  email: string | null;
  role: string;
  branchId: string | null;
  customerId: string | null;
  stylistId: string | null;
  name: string | null;
  active: boolean;
}

export interface AdminBranch extends Branch {
  active: boolean;
  _count: { services: number; stylists: number };
}

export interface AdminService extends Service {
  branchId: string;
  active: boolean;
}

export interface WorkingHour {
  id: string;
  stylistId: string;
  dayOfWeek: number; // 0 = Chủ nhật, 1 = Thứ 2 ... 6 = Thứ 7
  startTime: string; // "HH:mm" giờ VN
  endTime: string;
}

export interface TimeOff {
  id: string;
  stylistId: string;
  startTime: string;
  endTime: string;
  reason: string | null;
}

export interface AdminStylist {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  active: boolean;
  workingHours: WorkingHour[];
  timeOffs: TimeOff[];
}

export interface CalendarBooking {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  note: string | null;
  branchId: string;
  stylist: { id: string; name: string };
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    price: number;
  };
  customer: { id: string; name: string; phone: string };
  depositAmount: number;
  depositStatus: string;
  priceAtBooking: number;
  discountAmount: number;
}

export interface CalendarResponse {
  bookings: CalendarBooking[];
}

export interface RevenueRow {
  period: string;
  depositCollected: number;
  counterPaid: number;
  total: number;
  bookingCount: number;
  completedCount: number;
  cancelledCount: number;
}

export interface RevenueResponse {
  rows: RevenueRow[];
  summary: RevenueRow;
}

export interface StylistMe {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  branch: {
    id: string;
    name: string;
    address: string;
    openTime: string;
    closeTime: string;
  };
  workingHours: { dayOfWeek: number; startTime: string; endTime: string }[];
  timeOffs: { id: string; startTime: string; endTime: string; reason: string | null }[];
}

export interface StylistBooking {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  branchId: string;
  note: string | null;
  service: { name: string; durationMinutes: number; price: number };
  customer: { name: string; phone: string };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Không gắn Authorization header (dùng cho auth endpoints public) */
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token && !options.skipAuth) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const doFetch = (): Promise<Response> =>
    fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let response = await doFetch();

  // 401 → thử refresh token một lần rồi gửi lại request gốc.
  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.Authorization = `Bearer ${getAccessToken()}`;
      response = await doFetch();
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    expireSession();
    return false;
  }
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      expireSession();
      return false;
    }
    const data = (await res.json()) as AuthResponse;
    setAccessToken(data.accessToken);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("salon_refresh_token", data.refreshToken);
    }
    return true;
  } catch {
    expireSession();
    return false;
  }
}

/** Xóa phiên và chuyển về trang đăng nhập (trang sẽ được xây ở task 16). */
function expireSession(): void {
  clearTokens();
  if (
    typeof window !== "undefined" &&
    window.location.pathname !== "/dang-nhap"
  ) {
    window.location.href = "/dang-nhap";
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody | undefined;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = undefined;
  }
  const message =
    typeof body?.message === "string" && body.message.length > 0
      ? body.message
      : "Đã có lỗi xảy ra, vui lòng thử lại sau";
  return new ApiError(message, body?.statusCode ?? response.status, body?.requestId);
}

export async function apiGet<T>(path: string, skipAuth = false): Promise<T> {
  return request<T>(path, { method: "GET", skipAuth });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  skipAuth = false,
): Promise<T> {
  return request<T>(path, { method: "POST", body, skipAuth });
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  skipAuth = false,
): Promise<T> {
  return request<T>(path, { method: "PATCH", body, skipAuth });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  skipAuth = false,
): Promise<T> {
  return request<T>(path, { method: "PUT", body, skipAuth });
}

export async function apiDelete<T>(path: string, skipAuth = false): Promise<T> {
  return request<T>(path, { method: "DELETE", skipAuth });
}

/** Lưu token sau register/login/refresh, kèm thông tin user. */
export function saveAuth(data: AuthResponse): void {
  setTokens(data.accessToken, data.refreshToken, data.user);
}
