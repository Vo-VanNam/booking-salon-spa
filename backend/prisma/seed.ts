import { PrismaClient, BookingStatus, DepositStatus, UserRole, LoyaltyType } from '@prisma/client';
import { DateTime } from 'luxon';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const TZ = 'Asia/Ho_Chi_Minh';

// Mat khau admin seed BAT BUOC tu env SEED_ADMIN_PASSWORD (khong co gia tri mac
// dinh) — tranh tao tai khoan admin voi mat khau biet truoc khi quen set env.
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@salonglow.vn';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error(
    'Seed that bai: thieu bien moi truong SEED_ADMIN_PASSWORD (xem backend/.env.example; doi mat khau ngay khi deploy).',
  );
  process.exit(1);
}

// Ngay gio tinh theo gio dia phuong VN roi chuyen sang UTC de luu vao DB.
function vnTime(dayOffset: number, hour: number, minute: number): Date {
  const today = DateTime.now().setZone(TZ).startOf('day');
  return today.plus({ days: dayOffset, hours: hour, minutes: minute }).toUTC().toJSDate();
}

interface ServiceSeed {
  name: string;
  description: string;
  basePrice: number; // VND
  durationMinutes: number;
}

// Gia goc ap dung cho Q1; Q7/Thu Duc chenh nhe 10-20k.
const SERVICES: ServiceSeed[] = [
  { name: 'Cắt tóc nam', description: 'Cắt tóc nam theo yêu cầu, gội và tạo kiểu', basePrice: 150_000, durationMinutes: 30 },
  { name: 'Cắt tóc nữ', description: 'Cắt tóc nữ, thổi sấy tạo kiểu', basePrice: 200_000, durationMinutes: 45 },
  { name: 'Gội đầu massage', description: 'Gội đầu thảo dược kết hợp massage đầu - cổ - vai', basePrice: 200_000, durationMinutes: 45 },
  { name: 'Nhuộm tóc', description: 'Nhuộm tóc cao cấp, bao gồm dưỡng sau nhuộm', basePrice: 600_000, durationMinutes: 120 },
  { name: 'Uốn tóc', description: 'Uốn tóc công nghệ Nhật, giữ nếp lâu', basePrice: 700_000, durationMinutes: 150 },
  { name: 'Massage body', description: 'Massage toàn thân thư giãn với tinh dầu', basePrice: 350_000, durationMinutes: 60 },
  { name: 'Massage mặt', description: 'Massage mặt chuyên sâu, giảm căng thẳng', basePrice: 280_000, durationMinutes: 45 },
  { name: 'Chăm sóc da mặt', description: 'Chăm sóc da mặt toàn diện theo quy trình chuẩn', basePrice: 450_000, durationMinutes: 60 },
];

// Chenh gia theo chi nhanh (VND), index theo SERVICE.
const PRICE_ADJUST: Record<string, number[]> = {
  'Salon Glow Quận 1': [0, 0, 0, 0, 0, 0, 0, 0],
  'Salon Glow Quận 7': [20_000, 20_000, 10_000, 20_000, 20_000, 10_000, 10_000, 20_000],
  'Salon Glow Thủ Đức': [-10_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000, -10_000],
};

interface BranchSeed {
  name: string;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  stylists: { name: string; phone: string; email: string; skipMonday: boolean; skipSunday: boolean }[];
}

const BRANCHES: BranchSeed[] = [
  {
    name: 'Salon Glow Quận 1',
    address: '123 Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM',
    phone: '02838234567',
    openTime: '09:00',
    closeTime: '21:00',
    stylists: [
      { name: 'Nguyễn Văn Hùng', phone: '0901234001', email: 'hung.nguyen@salonglow.vn', skipMonday: true, skipSunday: false },
      { name: 'Trần Thị Mai', phone: '0901234002', email: 'mai.tran@salonglow.vn', skipMonday: false, skipSunday: true },
      { name: 'Lê Hoàng Anh', phone: '0901234003', email: 'hoanganh.le@salonglow.vn', skipMonday: false, skipSunday: false },
      { name: 'Phạm Thu Trang', phone: '0901234004', email: 'thutrang.pham@salonglow.vn', skipMonday: false, skipSunday: false },
    ],
  },
  {
    name: 'Salon Glow Quận 7',
    address: '456 Nguyễn Thị Thập, Quận 7, TP.HCM',
    phone: '02854123456',
    openTime: '10:00',
    closeTime: '22:00',
    stylists: [
      { name: 'Đỗ Minh Quân', phone: '0901234005', email: 'minhquan.do@salonglow.vn', skipMonday: true, skipSunday: false },
      { name: 'Vũ Thị Hồng', phone: '0901234006', email: 'thihong.vu@salonglow.vn', skipMonday: false, skipSunday: true },
      { name: 'Hoàng Minh Châu', phone: '0901234007', email: 'minhchau.hoang@salonglow.vn', skipMonday: false, skipSunday: false },
      { name: 'Đặng Ngọc Linh', phone: '0901234008', email: 'ngoclinh.dang@salonglow.vn', skipMonday: false, skipSunday: false },
    ],
  },
  {
    name: 'Salon Glow Thủ Đức',
    address: '789 Võ Văn Ngân, TP. Thủ Đức, TP.HCM',
    phone: '02838912345',
    openTime: '09:00',
    closeTime: '20:30',
    stylists: [
      { name: 'Bùi Thanh Tùng', phone: '0901234009', email: 'thanhtung.bui@salonglow.vn', skipMonday: true, skipSunday: false },
      { name: 'Lý Thu Hà', phone: '0901234010', email: 'thuha.ly@salonglow.vn', skipMonday: false, skipSunday: true },
      { name: 'Trịnh Quốc Bảo', phone: '0901234011', email: 'quocbao.trinh@salonglow.vn', skipMonday: false, skipSunday: false },
      { name: 'Ngô Thị Lan Anh', phone: '0901234012', email: 'lananh.ngo@salonglow.vn', skipMonday: false, skipSunday: false },
    ],
  },
];

async function main() {
  // Idempotent: neu da seed roi thi thoat de khong tao du lieu trung.
  const existingBranches = await prisma.branch.count();
  if (existingBranches > 0) {
    console.log('Seed đã chạy trước đó — bỏ qua để tránh dữ liệu trùng.');
    return;
  }

  let serviceCount = 0;
  let stylistCount = 0;
  let workingHourCount = 0;
  let userCount = 0;

  const branchIdByName: Record<string, string> = {};
  const servicesByName: Record<string, string> = {}; // key: `${branchName}::${serviceName}` -> id
  const stylistIdByName: Record<string, string> = {}; // key: `${branchName}::${stylistName}` -> id

  // 1. Chi nhanh + dich vu + stylist + gio lam viec
  for (const b of BRANCHES) {
    const branch = await prisma.branch.create({
      data: { name: b.name, address: b.address, phone: b.phone, openTime: b.openTime, closeTime: b.closeTime },
    });
    branchIdByName[b.name] = branch.id;

    const adjust = PRICE_ADJUST[b.name];
    for (let i = 0; i < SERVICES.length; i++) {
      const s = SERVICES[i];
      const service = await prisma.service.create({
        data: {
          branchId: branch.id,
          name: s.name,
          description: s.description,
          price: s.basePrice + adjust[i],
          durationMinutes: s.durationMinutes,
        },
      });
      serviceCount++;
      servicesByName[`${b.name}::${s.name}`] = service.id;
    }

    for (const st of b.stylists) {
      const stylist = await prisma.stylist.create({
        data: { branchId: branch.id, name: st.name, phone: st.phone, email: st.email },
      });
      stylistCount++;
      stylistIdByName[`${b.name}::${st.name}`] = stylist.id;

      // Gio lam mac dinh 09:00-21:00 ca tuan; stylist dau branch nghi Thu 2
      // (dayOfWeek=1), stylist thu hai nghi Chu nhat (dayOfWeek=0).
      for (let day = 0; day <= 6; day++) {
        if (st.skipMonday && day === 1) continue;
        if (st.skipSunday && day === 0) continue;
        await prisma.workingHour.create({
          data: { stylistId: stylist.id, dayOfWeek: day, startTime: '09:00', endTime: '21:00' },
        });
        workingHourCount++;
      }
    }
  }

  // 2. Nghi phep: Tran Thi Mai (Q1) nghi ngay mai 14:00-16:00
  await prisma.timeOff.create({
    data: {
      stylistId: stylistIdByName['Salon Glow Quận 1::Trần Thị Mai'],
      startTime: vnTime(1, 14, 0),
      endTime: vnTime(1, 16, 0),
      reason: 'Khám bệnh',
    },
  });

  // 3. Tai khoan: 1 super_admin + 3 branch_admin
  const adminPasswordHash = await argon2.hash(ADMIN_PASSWORD);
  await prisma.user.create({
    data: { email: ADMIN_EMAIL, passwordHash: adminPasswordHash, role: UserRole.super_admin },
  });
  userCount++;
  for (let i = 1; i <= 3; i++) {
    await prisma.user.create({
      data: {
        email: `branch${i}@salonglow.vn`,
        passwordHash: adminPasswordHash,
        role: UserRole.branch_admin,
        branchId: branchIdByName[BRANCHES[i - 1].name],
      },
    });
    userCount++;
  }

  // 4. Khach hang
  const hoa = await prisma.customer.create({
    data: { name: 'Nguyễn Thị Hoa', phone: '0901234567' },
  });
  const nam = await prisma.customer.create({
    data: { name: 'Trần Văn Nam', phone: '0912345678', completedCount: 1 },
  });

  // 5. Booking mau tren stylist Nguyen Van Hung (Q1), khong overlap nhau.
  const q1 = 'Salon Glow Quận 1';
  const hung = stylistIdByName[`${q1}::Nguyễn Văn Hùng`];
  const sv = (name: string) => servicesByName[`${q1}::${name}`];
  const price = (name: string) => SERVICES.find((s) => s.name === name)!.basePrice;

  interface BookingSeed {
    dayOffset: number;
    startHour: number;
    startMinute: number;
    serviceName: string;
    customerId: string;
    status: BookingStatus;
    deposit?: boolean;
  }

  // Ngay mai (T+1): 5 booking confirmed (booking nhuom co coc truoc 30%).
  // Ngay kia (T+2): 3 booking confirmed. Hom qua (T-1): 1 completed.
  // 3 ngay truoc (T-3): 1 cancelled.
  const bookingsSeed: BookingSeed[] = [
    { dayOffset: 1, startHour: 9, startMinute: 0, serviceName: 'Cắt tóc nam', customerId: hoa.id, status: BookingStatus.confirmed },
    { dayOffset: 1, startHour: 9, startMinute: 45, serviceName: 'Gội đầu massage', customerId: nam.id, status: BookingStatus.confirmed },
    { dayOffset: 1, startHour: 10, startMinute: 45, serviceName: 'Nhuộm tóc', customerId: hoa.id, status: BookingStatus.confirmed, deposit: true },
    { dayOffset: 1, startHour: 13, startMinute: 0, serviceName: 'Cắt tóc nam', customerId: nam.id, status: BookingStatus.confirmed },
    { dayOffset: 1, startHour: 14, startMinute: 0, serviceName: 'Massage body', customerId: hoa.id, status: BookingStatus.confirmed },
    { dayOffset: 2, startHour: 9, startMinute: 0, serviceName: 'Massage mặt', customerId: nam.id, status: BookingStatus.confirmed },
    { dayOffset: 2, startHour: 10, startMinute: 0, serviceName: 'Cắt tóc nam', customerId: hoa.id, status: BookingStatus.confirmed },
    { dayOffset: 2, startHour: 11, startMinute: 0, serviceName: 'Massage body', customerId: nam.id, status: BookingStatus.confirmed },
    { dayOffset: -1, startHour: 15, startMinute: 0, serviceName: 'Massage body', customerId: nam.id, status: BookingStatus.completed },
    { dayOffset: -3, startHour: 10, startMinute: 0, serviceName: 'Gội đầu massage', customerId: hoa.id, status: BookingStatus.cancelled },
  ];

  let bookingCount = 0;
  let completedBookingId: string | undefined;
  for (const bs of bookingsSeed) {
    const service = SERVICES.find((s) => s.name === bs.serviceName)!;
    const durationMinutes = service.durationMinutes;
    const start = vnTime(bs.dayOffset, bs.startHour, bs.startMinute);
    const end = vnTime(bs.dayOffset, bs.startHour, bs.startMinute + durationMinutes);
    const isCancelled = bs.status === BookingStatus.cancelled;
    const booking = await prisma.booking.create({
      data: {
        branchId: branchIdByName[q1],
        serviceId: sv(bs.serviceName),
        stylistId: hung,
        customerId: bs.customerId,
        startTime: start,
        endTime: end,
        status: bs.status,
        priceAtBooking: price(bs.serviceName),
        depositAmount: bs.deposit ? Math.round(price(bs.serviceName) * 0.3) : 0,
        depositStatus: bs.deposit ? DepositStatus.pending : DepositStatus.none,
        cancelledAt: isCancelled ? vnTime(bs.dayOffset, 16, 0) : undefined,
        cancelReason: isCancelled ? 'Khách bận việc đột xuất' : undefined,
      },
    });
    bookingCount++;
    if (bs.status === BookingStatus.completed) completedBookingId = booking.id;
  }

  // 6. Loyalty: Nam cong 10 diem cho booking completed (hop nhat voi completedCount=1).
  const loyaltyCount = await prisma.loyaltyTransaction.create({
    data: {
      customerId: nam.id,
      bookingId: completedBookingId,
      points: 10,
      type: LoyaltyType.earn,
      reason: 'Hoàn thành lịch hẹn',
      actorType: 'system',
    },
  });
  await prisma.customer.update({
    where: { id: nam.id },
    data: { loyaltyPoints: { increment: loyaltyCount.points } },
  });

  console.log(
    `Seed hoàn tất: ${BRANCHES.length} chi nhánh, ${serviceCount} dịch vụ, ${stylistCount} stylist, ` +
      `${workingHourCount} ca làm việc, ${userCount} tài khoản, 2 khách hàng, ${bookingCount} booking, 1 giao dịch loyalty.`,
  );
}

main()
  .catch((e) => {
    console.error('Seed thất bại:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
