export interface Branch {
  id: string;
  name: string;
  address: string;
  open_time: string;
  close_time: string;
}

export interface Service {
  id: string;
  branch_id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  is_active?: boolean;
}

export interface Stylist {
  id: string;
  branch_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  bio?: string | null;
  is_active: boolean;
  working_hours?: WorkingHour[];
  time_off?: TimeOff[];
}

export interface WorkingHour {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

export interface TimeOff {
  id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

export interface Slot {
  start_time: string;
  end_time: string;
  branch_id: string;
  stylist_id: string;
  service_id: string;
  duration_minutes: number;
}

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export type DepositStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';

export interface Booking {
  id: string;
  status: BookingStatus;
  start_time: string;
  end_time: string;
  deposit_status: DepositStatus;
  deposit_amount: number;
  discount_amount: number;
  price: number;
  branch_id: string;
  service_id: string;
  stylist_id: string;
  customer_id: string;
  source?: string;
  note?: string | null;
  created_at: string;
  branch?: Branch;
  service?: { id: string; name: string; price: number; duration_minutes: number };
  stylist?: { id: string; name: string };
  customer?: { id: string; name: string; phone: string; email: string | null };
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'customer' | 'stylist' | 'branch_admin' | 'super_admin';
  name: string;
  branch_id: string | null;
  branch_name?: string | null;
  stylist_id: string | null;
  stylist_name?: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: AuthUser;
}

export interface RevenueResponse {
  total_revenue: number;
  currency: string;
  completed_bookings: number;
  deposit_collected: number;
  by_branch: { branch_id: string; branch_name: string; total_revenue: number; completed_bookings: number }[];
  by_day: { date: string; total_revenue: number; completed_bookings: number }[];
  by_month: { month: string; total_revenue: number; completed_bookings: number }[];
}

export interface DashboardResponse {
  date: string;
  branch_id: string | null;
  bookings_total: number;
  bookings_by_status: Record<string, number>;
  revenue_today: number;
  active_stylists: number;
  upcoming_bookings: number;
  next_booking: {
    id: string;
    start_time: string;
    customer_name: string;
    stylist_name: string | null;
    service_name: string;
    branch_name: string;
  } | null;
}

export interface ChatResponse {
  reply: string;
  message: string;
  session_id: string;
  needs_human: boolean;
  tool_calls: { name: string; arguments: unknown; success: boolean }[];
}
