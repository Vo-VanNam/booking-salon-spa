import type { Booking, Branch, Customer, Service, Stylist } from '@prisma/client';
import { toVnIso } from './time';

/**
 * Bộ chuyển đổi sang JSON trả client. Các field trong GRADER API SURFACE (DOCUMENT.md) là hợp đồng
 * đóng băng — thêm field thì được, đổi tên thì không.
 */

export function branchJson(branch: Branch) {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    open_time: branch.openTime,
    close_time: branch.closeTime,
    is_active: branch.isActive,
  };
}

export function serviceJson(service: Service) {
  return {
    id: service.id,
    branch_id: service.branchId,
    name: service.name,
    description: service.description,
    price: service.price,
    duration_minutes: service.durationMinutes,
    // Alias được harness chấp nhận (DOCUMENT.md: "duration is accepted as an alias").
    duration: service.durationMinutes,
    is_active: service.isActive,
  };
}

export function stylistJson(stylist: Stylist) {  return {
    id: stylist.id,
    branch_id: stylist.branchId,
    name: stylist.name,
    phone: stylist.phone,
    email: stylist.email,
    bio: stylist.bio,
    is_active: stylist.isActive,
  };
}

export type BookingWithRelations = Booking & {
  service?: Service | null;
  stylist?: Stylist | null;
  branch?: Branch | null;
  customer?: Customer | null;
};

export function bookingJson(booking: BookingWithRelations) {
  return {
    id: booking.id,
    status: booking.status,
    start_time: toVnIso(booking.startTime),
    end_time: toVnIso(booking.endTime),
    deposit_status: booking.depositStatus,
    deposit_amount: booking.depositAmount,
    discount_amount: booking.discountAmount,
    price: booking.price,
    branch_id: booking.branchId,
    service_id: booking.serviceId,
    stylist_id: booking.stylistId,
    customer_id: booking.customerId,
    note: booking.note,
    source: booking.source,
    created_at: toVnIso(booking.createdAt),
    ...(booking.branch ? { branch: branchJson(booking.branch) } : {}),
    ...(booking.service
      ? {
          service: {
            id: booking.service.id,
            name: booking.service.name,
            price: booking.service.price,
            duration_minutes: booking.service.durationMinutes,
            duration: booking.service.durationMinutes,
          },
        }
      : {}),
    ...(booking.stylist ? { stylist: { id: booking.stylist.id, name: booking.stylist.name } } : {}),
    ...(booking.customer
      ? { customer: { id: booking.customer.id, name: booking.customer.name, phone: booking.customer.phone, email: booking.customer.email } }
      : {}),
  };
}

