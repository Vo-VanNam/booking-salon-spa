// Integration test CHỈ chạy trên DB riêng booking_test — ép env ở đây (chạy
// trước mọi spec) để không bao giờ đụng vào DB dev salon_spa.
process.env.DATABASE_URL =
  'postgresql://salon:salon_dev_password@localhost:5432/booking_test?schema=public';

import { PrismaClient, UserRole } from '@prisma/client';
import argon2 from 'argon2';
import Redis from 'ioredis';

export const FIXTURE = {
  customerPhone: '0901112222',
  customerPassword: 'Customer@123',
  superAdminEmail: 'admin@test.vn',
  superAdminPassword: 'Admin@123',
  branchAdminPhone: '0922333444',
  branchAdminPassword: 'BranchAdmin@123',
  stylistPhone: '0911222333',
  stylistPassword: 'Stylist@123',
  branchAdminBPhone: '0951112222',
  branchAdminBPassword: 'BranchAdminB@123',
};

const prisma = new PrismaClient();
const redis = new Redis('redis://localhost:6379');

// Fixture nhỏ: 1 branch (mở cửa 09:00-22:00), 1 service 30 phút, 1 stylist với
// working hours 09:00-21:00 đủ 7 ngày (đơn giản, không vướng ngày nghỉ), 1 khách.
// Stylist kết thúc sớm hơn branch 1 tiếng để phân biệt được lỗi "Ngoài giờ mở cửa
// của chi nhánh" và "Ngoài giờ làm việc của stylist" ở test slot sát biên.
// Kèm 4 tài khoản (customer, super_admin, branch_admin, stylist) cho auth test.
async function seedFixture(): Promise<void> {
  const branch = await prisma.branch.create({
    data: {
      name: 'Chi nhánh Test',
      address: '123 Đường Test',
      phone: '0280000000',
      openTime: '09:00',
      closeTime: '22:00',
    },
  });
  await prisma.service.create({
    data: {
      branchId: branch.id,
      name: 'Dịch vụ Test 30 phút',
      price: 150000,
      durationMinutes: 30,
    },
  });
  const stylist = await prisma.stylist.create({
    data: { branchId: branch.id, name: 'Stylist Test', phone: '0901234999' },
  });
  for (let day = 0; day <= 6; day++) {
    await prisma.workingHour.create({
      data: {
        stylistId: stylist.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '21:00',
      },
    });
  }
  const customer = await prisma.customer.create({
    data: { name: 'Khách Test', phone: FIXTURE.customerPhone },
  });
  await prisma.user.create({
    data: {
      phone: FIXTURE.customerPhone,
      passwordHash: await argon2.hash(FIXTURE.customerPassword),
      role: UserRole.customer,
      customerId: customer.id,
    },
  });
  await prisma.user.create({
    data: {
      email: FIXTURE.superAdminEmail,
      passwordHash: await argon2.hash(FIXTURE.superAdminPassword),
      role: UserRole.super_admin,
    },
  });
  await prisma.user.create({
    data: {
      phone: FIXTURE.branchAdminPhone,
      passwordHash: await argon2.hash(FIXTURE.branchAdminPassword),
      role: UserRole.branch_admin,
      branchId: branch.id,
    },
  });
  const branchB = await prisma.branch.create({
    data: {
      name: 'Chi nhánh Test 2',
      address: '456 Đường Test B',
      phone: '0281111111',
      openTime: '09:00',
      closeTime: '20:00',
    },
  });
  await prisma.user.create({
    data: {
      phone: FIXTURE.branchAdminBPhone,
      passwordHash: await argon2.hash(FIXTURE.branchAdminBPassword),
      role: UserRole.branch_admin,
      branchId: branchB.id,
    },
  });
  const stylist2 = await prisma.stylist.create({
    data: { branchId: branch.id, name: 'Stylist Test 2', phone: '0901234888' },
  });
  for (let day = 0; day <= 6; day++) {
    await prisma.workingHour.create({
      data: {
        stylistId: stylist2.id,
        dayOfWeek: day,
        startTime: '09:00',
        endTime: '21:00',
      },
    });
  }
  await prisma.user.create({
    data: {
      phone: FIXTURE.stylistPhone,
      passwordHash: await argon2.hash(FIXTURE.stylistPassword),
      role: UserRole.stylist,
      stylistId: stylist.id,
    },
  });
}

beforeAll(async () => {
  // Xóa sạch toàn bộ dữ liệu (đủ thứ tự khóa ngoại) rồi seed fixture mới.
  // User phải xóa trước (FK tới branch/stylist/customer) và không được giữ lại
  // giữa các lần chạy để không dính unique phone/email.
  await prisma.user.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.loyaltyTransaction.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.workingHour.deleteMany();
  await prisma.stylist.deleteMany();
  await prisma.service.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.branch.deleteMany();
  await redis.flushdb();
  await seedFixture();
});

// Mỗi test bắt đầu với DB sạch booking/time_off + cache Redis sạch.
beforeEach(async () => {
  await prisma.booking.deleteMany();
  await prisma.timeOff.deleteMany();
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
