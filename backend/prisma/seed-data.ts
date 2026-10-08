/**
 * Dữ liệu seed theo BENCHMARK RUN CONTRACT §4 — tách khỏi CLI để test dùng lại (idempotent).
 */
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const PASSWORD = {
  superAdmin: 'admin12345',
  branchAdmin: 'branch12345',
  stylist: 'stylist12345',
};

interface BranchSeed {
  id: string;
  name: string;
  address: string;
  services: { id: string; name: string; price: number; duration: number; description: string }[];
  stylists: { id: string; name: string; phone: string; email: string }[];
}

export const BRANCHES: BranchSeed[] = [
  {
    id: 'branch-1',
    name: 'Chi nhánh Quận 3',
    address: '125 Võ Văn Tần, Phường 6, Quận 3, TP. Hồ Chí Minh',
    services: [
      { id: 'svc-1-1', name: 'Gội đầu & massage cổ vai gáy', price: 180_000, duration: 45, description: 'Thư giãn 45 phút với tinh dầu thảo mộc.' },
      { id: 'svc-1-2', name: 'Cắt tóc tạo kiểu', price: 250_000, duration: 60, description: 'Tư vấn form tóc theo khuôn mặt.' },
      { id: 'svc-1-3', name: 'Nhuộm tóc cao cấp', price: 890_000, duration: 120, description: 'Thuốc nhuộm không amoniac, bảo vệ da đầu.' },
    ],
    stylists: [
      { id: 'stylist-1-1', name: 'Nguyễn Thu Hà', phone: '0901234567', email: 'ha.stylist@booking.vn' },
      { id: 'stylist-1-2', name: 'Trần Minh Quân', phone: '0912345678', email: 'quan.stylist@booking.vn' },
    ],
  },
  {
    id: 'branch-2',
    name: 'Chi nhánh Quận 7',
    address: '58 Nguyễn Thị Thập, Phường Bình Thuận, Quận 7, TP. Hồ Chí Minh',
    services: [
      { id: 'svc-2-1', name: 'Chăm sóc da mặt cơ bản', price: 320_000, duration: 60, description: 'Làm sạch sâu, đắp mặt nạ khoáng.' },
      { id: 'svc-2-2', name: 'Massage toàn thân đá nóng', price: 450_000, duration: 90, description: 'Giảm căng cơ với đá bazan nóng.' },
    ],
    stylists: [
      { id: 'stylist-2-1', name: 'Lê Ngọc Mai', phone: '0923456789', email: 'mai.stylist@booking.vn' },
      { id: 'stylist-2-2', name: 'Phạm Anh Tuấn', phone: '0934567890', email: 'tuan.stylist@booking.vn' },
    ],
  },
  {
    id: 'branch-3',
    name: 'Chi nhánh Hà Nội – Cầu Giấy',
    address: '72 Xuân Thuỷ, Phường Dịch Vọng, Quận Cầu Giấy, Hà Nội',
    services: [
      { id: 'svc-3-1', name: 'Nối mi Hàn Quốc', price: 380_000, duration: 75, description: 'Mi sợi mảnh, giữ nếp 3–4 tuần.' },
      { id: 'svc-3-2', name: 'Sơn gel móng tay', price: 150_000, duration: 45, description: 'Gel bền màu, kèm chăm sóc da tay.' },
    ],
    stylists: [
      { id: 'stylist-3-1', name: 'Đỗ Thanh Vân', phone: '0945678901', email: 'van.stylist@booking.vn' },
      { id: 'stylist-3-2', name: 'Hoàng Gia Bảo', phone: '0956789012', email: 'bao.stylist@booking.vn' },
    ],
  },
];

export const SEED_ACCOUNTS = {
  superAdmin: { email: 'admin@booking.vn', password: PASSWORD.superAdmin },
  branchAdmin: { email: 'branch1@booking.vn', password: PASSWORD.branchAdmin },
  stylist: { email: 'stylist1@booking.vn', password: PASSWORD.stylist },
};

async function upsertUser(
  prisma: PrismaClient,
  params: {
    email: string;
    password: string;
    role: 'customer' | 'stylist' | 'branch_admin' | 'super_admin';
    fullName: string;
    branchId?: string | null;
    stylistId?: string | null;
  },
): Promise<void> {
  const passwordHash = await bcrypt.hash(params.password, 10);
  await prisma.user.upsert({
    where: { email: params.email },
    update: {
      role: params.role,
      fullName: params.fullName,
      branchId: params.branchId ?? null,
      stylistId: params.stylistId ?? null,
      isActive: true,
    },
    create: {
      email: params.email,
      passwordHash,
      role: params.role,
      fullName: params.fullName,
      branchId: params.branchId ?? null,
      stylistId: params.stylistId ?? null,
    },
  });
}

export async function seedAll(prisma: PrismaClient): Promise<void> {
  for (const branch of BRANCHES) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      update: { name: branch.name, address: branch.address, openTime: '08:00', closeTime: '20:00', isActive: true },
      create: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        openTime: '08:00',
        closeTime: '20:00',
        isActive: true,
      },
    });

    for (const service of branch.services) {
      await prisma.service.upsert({
        where: { id: service.id },
        update: {
          branchId: branch.id,
          name: service.name,
          description: service.description,
          price: service.price,
          durationMinutes: service.duration,
          isActive: true,
        },
        create: {
          id: service.id,
          branchId: branch.id,
          name: service.name,
          description: service.description,
          price: service.price,
          durationMinutes: service.duration,
        },
      });
    }

    for (const stylist of branch.stylists) {
      await prisma.stylist.upsert({
        where: { id: stylist.id },
        update: { branchId: branch.id, name: stylist.name, phone: stylist.phone, email: stylist.email, isActive: true },
        create: { id: stylist.id, branchId: branch.id, name: stylist.name, phone: stylist.phone, email: stylist.email },
      });

      // working_hours 08:00–20:00 cho cả 7 ngày, không có time_off (hợp đồng §4).
      for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
        await prisma.workingHour.upsert({
          where: { stylistId_dayOfWeek_startTime: { stylistId: stylist.id, dayOfWeek, startTime: '08:00' } },
          update: { endTime: '20:00', isActive: true },
          create: { stylistId: stylist.id, dayOfWeek, startTime: '08:00', endTime: '20:00' },
        });
      }
    }
  }

  await upsertUser(prisma, { email: 'admin@booking.vn', password: PASSWORD.superAdmin, role: 'super_admin', fullName: 'Quản trị chuỗi' });
  await upsertUser(prisma, {
    email: 'branch1@booking.vn',
    password: PASSWORD.branchAdmin,
    role: 'branch_admin',
    fullName: 'Quản lý chi nhánh Quận 3',
    branchId: 'branch-1',
  });
  await upsertUser(prisma, {
    email: 'branch2@booking.vn',
    password: PASSWORD.branchAdmin,
    role: 'branch_admin',
    fullName: 'Quản lý chi nhánh Quận 7',
    branchId: 'branch-2',
  });
  await upsertUser(prisma, {
    email: 'branch3@booking.vn',
    password: PASSWORD.branchAdmin,
    role: 'branch_admin',
    fullName: 'Quản lý chi nhánh Cầu Giấy',
    branchId: 'branch-3',
  });
  await upsertUser(prisma, {
    email: 'stylist1@booking.vn',
    password: PASSWORD.stylist,
    role: 'stylist',
    fullName: 'Nguyễn Thu Hà',
    branchId: 'branch-1',
    stylistId: 'stylist-1-1',
  });
  await upsertUser(prisma, {
    email: 'stylist2@booking.vn',
    password: PASSWORD.stylist,
    role: 'stylist',
    fullName: 'Trần Minh Quân',
    branchId: 'branch-1',
    stylistId: 'stylist-1-2',
  });
}
