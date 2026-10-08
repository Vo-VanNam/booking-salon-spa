import type {
  AuthUser,
  Booking,
  Branch,
  ChatResponse,
  DashboardResponse,
  LoginResponse,
  RevenueResponse,
  Service,
  Slot,
  Stylist,
} from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8100';

const TOKEN_KEY = 'booking.access_token';
const REFRESH_KEY = 'booking.refresh_token';
const USER_KEY = 'booking.user';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
}

/** Gọi API backend; mọi lỗi được chuẩn hoá thành ApiError với message tiếng Việt từ server. */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  const token = options.token ?? getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.', 0, 'NETWORK');
  }

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (typeof payload?.message === 'string' && payload.message) ||
      (typeof payload?.error === 'string' && payload.error) ||
      'Đã có lỗi xảy ra. Vui lòng thử lại.';
    throw new ApiError(message, response.status, payload?.code, payload);
  }
  return payload as T;
}

// ───────────────────────── Tiện ích miền nghiệp vụ ─────────────────────────

export const catalogApi = {
  branches: () => api<Branch[]>('/branches'),
  services: (branchId: string, includeInactive = false) =>
    api<Service[]>(`/branches/${branchId}/services${includeInactive ? '?include_inactive=true' : ''}`),
  stylists: (branchId: string, includeInactive = false) =>
    api<Stylist[]>(`/branches/${branchId}/stylists${includeInactive ? '?include_inactive=true' : ''}`),
  stylist: (stylistId: string) => api<Stylist>(`/stylists/${stylistId}`),
  slots: (params: { branchId: string; stylistId: string; serviceId: string; date: string }) =>
    api<Slot[]>(
      `/slots?branch_id=${params.branchId}&stylist_id=${params.stylistId}&service_id=${params.serviceId}&date=${params.date}`,
    ),
};

export const bookingApi = {
  create: (body: Record<string, unknown>) => api<Booking>('/bookings', { method: 'POST', body }),
  get: (id: string) => api<Booking>(`/bookings/${id}`),
  byPhone: (phone: string) => api<Booking[]>(`/bookings?phone=${encodeURIComponent(phone)}`),
  cancel: (id: string, reason?: string) => api<Booking>(`/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),
  reschedule: (id: string, startTime: string) =>
    api<Booking>(`/bookings/${id}/reschedule`, { method: 'POST', body: { start_time: startTime } }),
  complete: (id: string) => api<Booking>(`/bookings/${id}/complete`, { method: 'POST' }),
  noShow: (id: string) => api<Booking>(`/bookings/${id}/no-show`, { method: 'POST' }),
  deposit: (id: string, provider: 'vnpay' | 'momo' = 'vnpay') =>
    api<{ payment_url: string; txn_ref: string; amount: number; provider: string }>(
      `/bookings/${id}/deposit?provider=${provider}`,
      { method: 'POST', body: {} },
    ),
};

export const adminApi = {
  revenue: (params: { branchId?: string; from?: string; to?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.branchId) query.set('branch_id', params.branchId);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return api<RevenueResponse>(`/admin/revenue${suffix}`);
  },
  dashboard: (params: { branchId?: string; date?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.branchId) query.set('branch_id', params.branchId);
    if (params.date) query.set('date', params.date);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return api<DashboardResponse>(`/admin/dashboard${suffix}`);
  },
  bookings: (params: { branchId?: string; from?: string; to?: string; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.branchId) query.set('branch_id', params.branchId);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return api<Booking[]>(`/admin/bookings${suffix}`);
  },
  topServices: (branchId?: string) =>
    api<{ service_id: string; service_name: string; bookings: number; revenue: number }[]>(
      `/admin/analytics/top-services${branchId ? `?branch_id=${branchId}` : ''}`,
    ),
  cancellationRate: (branchId?: string) =>
    api<{ cancellation_rate: number; total_bookings: number; cancelled: number; no_show: number }>(
      `/admin/analytics/cancellation-rate${branchId ? `?branch_id=${branchId}` : ''}`,
    ),
  createService: (body: Record<string, unknown>) => api<Service>('/services', { method: 'POST', body }),
  updateService: (id: string, body: Record<string, unknown>) => api<Service>(`/services/${id}`, { method: 'PATCH', body }),
  deactivateService: (id: string) => api<Service>(`/services/${id}`, { method: 'DELETE' }),
  createStylist: (body: Record<string, unknown>) => api<Stylist>('/stylists', { method: 'POST', body }),
  updateStylist: (id: string, body: Record<string, unknown>) => api<Stylist>(`/stylists/${id}`, { method: 'PATCH', body }),
  setWorkingHours: (id: string, workingHours: unknown[]) =>
    api<unknown>(`/stylists/${id}/working-hours`, { method: 'PUT', body: { working_hours: workingHours } }),
  addTimeOff: (id: string, body: { start_time: string; end_time: string; reason?: string }) =>
    api<unknown>(`/stylists/${id}/time-off`, { method: 'POST', body }),
  removeTimeOff: (stylistId: string, timeOffId: string) =>
    api<unknown>(`/stylists/${timeOffId ? `${stylistId}/time-off/${timeOffId}` : ''}`, { method: 'DELETE' }),
};

export const aiApi = {
  chat: (body: { message: string; session_id?: string }) => api<ChatResponse>('/ai/chat', { method: 'POST', body }),
  adminChat: (body: { message: string; session_id?: string }) =>
    api<ChatResponse>('/ai/admin-chat', { method: 'POST', body }),
};

export const stylistApi = {
  me: () => api<Stylist & { full_name: string }>('/stylist/me'),
  bookings: (from?: string, to?: string) => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return api<Booking[]>(`/stylist/me/bookings${suffix}`);
  },
};

// ───────────────────────── Phiên đăng nhập (staff) ─────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeSession(login: LoginResponse): void {
  window.localStorage.setItem(TOKEN_KEY, login.access_token);
  window.localStorage.setItem(REFRESH_KEY, login.refresh_token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(login.user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password }, token: null });
  storeSession(result);
  return result.user;
}

export async function loadProfile(): Promise<AuthUser> {
  return api<AuthUser>('/auth/me');
}
