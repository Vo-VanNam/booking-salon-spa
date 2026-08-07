import { HttpException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { TimeService, VN_TIMEZONE } from '../time/time.service';
import { AdminService } from './admin.service';
import { AdminRevenueService } from './admin-revenue.service';

const prisma = {
  branch: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  service: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  stylist: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  workingHour: {
    deleteMany: jest.fn((args: unknown) => args),
    createMany: jest.fn((args: unknown) => args),
  },
  timeOff: { findFirst: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  booking: { count: jest.fn(), findMany: jest.fn() },
  $transaction: jest.fn(),
};
const service = new AdminService(
  prisma as unknown as PrismaService,
  new TimeService(),
  new AdminRevenueService(),
);

beforeEach(() => jest.clearAllMocks());

const superUser = { role: 'super_admin', branchId: null };
const baA = { role: 'branch_admin', branchId: 'b1' };
const future = DateTime.now()
  .plus({ days: 2 })
  .setZone(VN_TIMEZONE)
  .set({ hour: 10, minute: 0, second: 0, millisecond: 0 });

describe('AdminService', () => {
  describe('listServices', () => {
    it('uses the branch_admin own branch, ignoring the param', async () => {
      prisma.service.findMany.mockResolvedValue([]);
      await service.listServices(baA, 'b2');
      expect(prisma.service.findMany).toHaveBeenCalledWith({
        where: { branchId: 'b1' },
        orderBy: { price: 'asc' },
      });
    });

    it('throws when the user cannot access the branch', async () => {
      await expect(async () =>
        service.listServices({ role: 'customer', branchId: null }, 'b1'),
      ).rejects.toThrow('Bạn không có quyền truy cập chi nhánh này');
    });
  });

  describe('createService', () => {
    it('throws when the branch_admin cannot access the target branch', async () => {
      await expect(
        service.createService(baA, {
          branchId: 'b2',
          name: 'x',
          price: 100000,
          durationMinutes: 30,
        }),
      ).rejects.toThrow('Bạn không có quyền truy cập chi nhánh này');
      expect(prisma.branch.findUnique).not.toHaveBeenCalled();
      expect(prisma.service.create).not.toHaveBeenCalled();
    });

    it('creates the service when the branch exists', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: 'b2' });
      prisma.service.create.mockResolvedValue({ id: 'sv1' });
      await expect(
        service.createService(superUser, {
          branchId: 'b2',
          name: 'x',
          price: 100000,
          durationMinutes: 30,
        }),
      ).resolves.toBeDefined();
      expect(prisma.service.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ branchId: 'b2' }) as {
          branchId: string;
        },
      });
    });

    it('throws when the branch does not exist', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);
      await expect(
        service.createService(superUser, {
          branchId: 'b2',
          name: 'x',
          price: 100000,
          durationMinutes: 30,
        }),
      ).rejects.toThrow('Không tìm thấy chi nhánh');
      expect(prisma.service.create).not.toHaveBeenCalled();
    });
  });

  describe('updateService', () => {
    it('throws when moving the service to another branch', async () => {
      prisma.service.findUnique.mockResolvedValue({
        id: 'sv1',
        branchId: 'b1',
        active: true,
      });
      await expect(
        service.updateService(superUser, 'sv1', {
          branchId: 'b2',
          price: 150000,
        }),
      ).rejects.toThrow('Không thể chuyển dịch vụ sang chi nhánh khác');
      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('throws when the branch_admin cannot access the service branch', async () => {
      prisma.service.findUnique.mockResolvedValue({
        id: 'sv1',
        branchId: 'b2',
        active: true,
      });
      await expect(
        service.updateService(baA, 'sv1', { price: 150000 }),
      ).rejects.toThrow('Bạn không có quyền truy cập chi nhánh này');
    });
  });

  describe('deactivateService', () => {
    it('throws when future bookings still exist', async () => {
      prisma.service.findUnique.mockResolvedValue({
        id: 'sv1',
        branchId: 'b1',
        active: true,
      });
      prisma.booking.count.mockResolvedValue(1);
      await expect(service.deactivateService(superUser, 'sv1')).rejects.toThrow(
        'Không thể vô hiệu hóa dịch vụ khi còn lịch hẹn chưa hoàn thành',
      );
      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('deactivates the service when no future bookings exist', async () => {
      prisma.service.findUnique.mockResolvedValue({
        id: 'sv1',
        branchId: 'b1',
        active: true,
      });
      prisma.booking.count.mockResolvedValue(0);
      prisma.service.update.mockResolvedValue({ id: 'sv1', active: false });
      await expect(
        service.deactivateService(superUser, 'sv1'),
      ).resolves.toBeDefined();
      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 'sv1' },
        data: { active: false },
      });
    });
  });

  describe('deactivateBranch', () => {
    it('throws when future bookings still exist', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: 'b1', active: true });
      prisma.booking.count.mockResolvedValue(1);
      await expect(service.deactivateBranch('b1')).rejects.toThrow(
        'Không thể vô hiệu hóa chi nhánh khi còn lịch hẹn chưa hoàn thành',
      );
    });

    it('throws when the branch is already deactivated', async () => {
      prisma.branch.findUnique.mockResolvedValue({ id: 'b1', active: false });
      await expect(service.deactivateBranch('b1')).rejects.toThrow(
        'Chi nhánh đã bị vô hiệu hóa',
      );
      expect(prisma.booking.count).not.toHaveBeenCalled();
    });

    it('throws when the branch does not exist', async () => {
      prisma.branch.findUnique.mockResolvedValue(null);
      await expect(service.deactivateBranch('b1')).rejects.toThrow(
        'Không tìm thấy chi nhánh',
      );
    });
  });

  describe('updateStylist', () => {
    it('throws when deactivating a stylist with future bookings', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      prisma.booking.count.mockResolvedValue(1);
      await expect(
        service.updateStylist(superUser, 's1', { active: false }),
      ).rejects.toThrow(
        'Không thể vô hiệu hóa stylist khi còn lịch hẹn chưa hoàn thành',
      );
      expect(prisma.stylist.update).not.toHaveBeenCalled();
    });

    it('deactivates the stylist when no future bookings exist', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      prisma.booking.count.mockResolvedValue(0);
      prisma.stylist.update.mockResolvedValue({ id: 's1', active: false });
      await expect(
        service.updateStylist(superUser, 's1', { active: false }),
      ).resolves.toBeDefined();
      expect(prisma.stylist.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { active: false },
      });
    });

    it('throws when the branch_admin cannot access the stylist branch', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b2' });
      await expect(
        service.updateStylist(baA, 's1', { name: 'x' }),
      ).rejects.toThrow('Bạn không có quyền truy cập chi nhánh này');
    });
  });

  describe('replaceWorkingHours', () => {
    it('replaces all working hours inside a transaction', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      prisma.$transaction.mockResolvedValue([{}, {}]);
      const items = Array.from({ length: 7 }, (_, i) => ({
        dayOfWeek: i,
        startTime: '09:00',
        endTime: '17:00',
      }));
      const result = await service.replaceWorkingHours(superUser, 's1', {
        workingHours: items,
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.objectContaining({ where: { stylistId: 's1' } }),
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              stylistId: 's1',
              dayOfWeek: 0,
              startTime: '09:00',
              endTime: '17:00',
            }),
            expect.objectContaining({ stylistId: 's1', dayOfWeek: 6 }),
          ]) as { stylistId: string; dayOfWeek: number }[],
        }),
      ]);
      expect(result).toEqual({ count: 7 });
    });

    it('throws on duplicate dayOfWeek', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      prisma.$transaction.mockResolvedValue([{}, {}]);
      await expect(
        service.replaceWorkingHours(superUser, 's1', {
          workingHours: [
            { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
            { dayOfWeek: 1, startTime: '18:00', endTime: '20:00' },
          ],
        }),
      ).rejects.toThrow('Trùng ngày trong tuần');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when startTime is not before endTime', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      prisma.$transaction.mockResolvedValue([{}, {}]);
      await expect(
        service.replaceWorkingHours(superUser, 's1', {
          workingHours: [
            { dayOfWeek: 0, startTime: '10:00', endTime: '10:00' },
          ],
        }),
      ).rejects.toThrow('Giờ bắt đầu phải trước giờ kết thúc');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws when the stylist does not exist', async () => {
      prisma.stylist.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockResolvedValue([{}, {}]);
      await expect(
        service.replaceWorkingHours(superUser, 's1', {
          workingHours: [
            { dayOfWeek: 0, startTime: '09:00', endTime: '17:00' },
          ],
        }),
      ).rejects.toThrow('Không tìm thấy stylist');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('createTimeOff', () => {
    it('throws a conflict with affected bookings when the time off overlaps', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      const start = future;
      const end = start.set({ hour: 12 });
      const dto = {
        startTime: start.toISO()!,
        endTime: end.toISO()!,
        reason: 'x',
      };
      const bkStart = DateTime.now()
        .plus({ days: 2 })
        .setZone(VN_TIMEZONE)
        .set({ hour: 10, minute: 30, second: 0, millisecond: 0 })
        .toJSDate();
      const bkEnd = DateTime.now()
        .plus({ days: 2 })
        .setZone(VN_TIMEZONE)
        .set({ hour: 11, minute: 30, second: 0, millisecond: 0 })
        .toJSDate();
      prisma.booking.findMany.mockResolvedValue([
        { id: 'bk1', startTime: bkStart, endTime: bkEnd },
      ]);
      let threw = false;
      try {
        await service.createTimeOff(baA, 's1', dto);
      } catch (e) {
        threw = true;
        const res = (e as HttpException).getResponse() as {
          message: string;
          affectedBookings?: { id: string; startTime: Date }[];
        };
        expect(res).toMatchObject({
          message: 'Thời gian nghỉ trùng với lịch hẹn hiện có',
        });
        expect(res.affectedBookings).toEqual([
          { id: 'bk1', startTime: bkStart },
        ]);
      }
      expect(threw).toBe(true);
      expect(prisma.timeOff.create).not.toHaveBeenCalled();
    });

    it('creates the time off when no bookings overlap', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      const start = future;
      const end = start.set({ hour: 12 });
      const dto = {
        startTime: start.toISO()!,
        endTime: end.toISO()!,
        reason: 'x',
      };
      prisma.booking.findMany.mockResolvedValue([]);
      await service.createTimeOff(baA, 's1', dto);
      expect(prisma.timeOff.create).toHaveBeenCalledWith({
        data: {
          startTime: dto.startTime,
          endTime: dto.endTime,
          reason: 'x',
          stylistId: 's1',
        },
      });
    });

    it('rejects an end time not after the start time', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      const start = future;
      const end = start.set({ hour: 9 });
      await expect(
        service.createTimeOff(baA, 's1', {
          startTime: start.toISO()!,
          endTime: end.toISO()!,
        }),
      ).rejects.toThrow('Thời gian nghỉ không hợp lệ');
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });

    it('rejects a start time in the past', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      await expect(
        service.createTimeOff(baA, 's1', {
          startTime: '2020-01-01T10:00:00+07:00',
          endTime: future.toISO()!,
        }),
      ).rejects.toThrow('Thời gian nghỉ phải bắt đầu trong tương lai');
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });
  });

  describe('deleteTimeOff', () => {
    it('throws when the time off does not exist', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      prisma.timeOff.findFirst.mockResolvedValue(null);
      await expect(service.deleteTimeOff(baA, 's1', 'to1')).rejects.toThrow(
        'Không tìm thấy thời gian nghỉ',
      );
      expect(prisma.timeOff.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the time off and returns its id', async () => {
      prisma.stylist.findUnique.mockResolvedValue({ id: 's1', branchId: 'b1' });
      prisma.timeOff.findFirst.mockResolvedValue({ id: 'to1' });
      const result = await service.deleteTimeOff(baA, 's1', 'to1');
      expect(prisma.timeOff.deleteMany).toHaveBeenCalledWith({
        where: { id: 'to1', stylistId: 's1' },
      });
      expect(result).toEqual({ id: 'to1' });
    });
  });

  describe('listStylists', () => {
    it('lists stylists of the resolved branch with working hours and future time offs', async () => {
      prisma.stylist.findMany.mockResolvedValue([]);
      await service.listStylists(baA, 'b2');
      expect(prisma.stylist.findMany).toHaveBeenCalledWith({
        where: { branchId: 'b1' },
        include: {
          workingHours: { orderBy: { dayOfWeek: 'asc' } },
          timeOffs: {
            where: { startTime: { gte: expect.any(Date) as Date } },
            orderBy: { startTime: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  });
});
