import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, generateRefreshToken, sha256 } from './auth.service';

const SECRET = 'unit-test-secret-at-least-32-characters-long';

const baseUser = {
  id: 'u1',
  phone: '0901112222',
  email: null,
  passwordHash: '',
  role: UserRole.customer,
  refreshTokenHash: null,
  active: true,
  lastLoginAt: null,
  customerId: 'c1',
  stylistId: null,
  branchId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

type UserRow = typeof baseUser & {
  customer?: { name: string } | null;
  stylist?: { name: string } | null;
};

type UserUpdateArg = {
  where: { id: string };
  data: { lastLoginAt?: Date; refreshTokenHash?: string | null };
};

type CreateUserArg = { data: Record<string, unknown> };

const makeTx = () => ({
  customer: {
    create: jest.fn<Promise<{ id: string }>, [CreateUserArg]>(),
  },
  user: {
    create: jest.fn<Promise<UserRow>, [CreateUserArg]>(),
  },
});

const makeService = () => {
  const prisma = {
    user: {
      findUnique: jest.fn<
        Promise<UserRow | null>,
        [{ where: { phone?: string; email?: string } }]
      >(),
      findFirst: jest.fn<Promise<UserRow | null>, [unknown]>(),
      update: jest.fn<Promise<UserRow>, [UserUpdateArg]>(),
    },
    customer: {
      findUnique: jest.fn<
        Promise<{ id: string } | null>,
        [{ where: { phone: string } }]
      >(),
    },
    $transaction: jest.fn(
      async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
        fn(makeTx()),
    ),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'jwt.accessSecret') return SECRET;
      if (key === 'jwt.accessTtl') return 900;
      return undefined;
    }),
  };
  const jwt = new JwtService();
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt,
    config as unknown as ConfigService,
  );
  return { service, prisma, jwt };
};

describe('sha256', () => {
  it('hash đúng giá trị đã biết', () => {
    expect(sha256('abc')).toBe(
      createHash('sha256').update('abc').digest('hex'),
    );
    expect(sha256('abc')).toHaveLength(64);
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('generateRefreshToken: 64 ký tự hex, ngẫu nhiên', () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(t1)).toBe(true);
    expect(t1).not.toBe(t2);
  });
});

describe('AuthService.register', () => {
  it('phone đã đăng ký (user) → 409 "Số điện thoại đã được đăng ký"', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.customer.findUnique.mockResolvedValue(null);
    await expect(
      service.register({
        name: 'Khách A',
        phone: '0901112222',
        password: 'MatKhau@123',
      }),
    ).rejects.toThrow('Số điện thoại đã được đăng ký');
  });

  it('phone đã tồn tại ở Customer (chưa có user) → 409', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue({ id: 'c9' });
    await expect(
      service.register({
        name: 'Khách A',
        phone: '0901112222',
        password: 'MatKhau@123',
      }),
    ).rejects.toThrow('Số điện thoại đã được đăng ký');
  });

  it('email đã đăng ký → 409 "Email đã được đăng ký"', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValueOnce(null); // phone
    prisma.customer.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u9' } as UserRow); // email
    await expect(
      service.register({
        name: 'Khách A',
        phone: '0901112222',
        email: 'a@b.vn',
        password: 'MatKhau@123',
      }),
    ).rejects.toThrow('Email đã được đăng ký');
  });

  it('phone không hợp lệ → 400 message chuẩn', async () => {
    const { service } = makeService();
    await expect(
      service.register({
        name: 'Khách A',
        phone: '12345',
        password: 'MatKhau@123',
      }),
    ).rejects.toThrow(
      'Số điện thoại không hợp lệ (yêu cầu 10 số, đầu 03/05/07/08/09)',
    );
  });

  it('password < 8 ký tự → 400 "Mật khẩu tối thiểu 8 ký tự"', async () => {
    const { service } = makeService();
    await expect(
      service.register({
        name: 'Khách A',
        phone: '0901112222',
        password: 'ngan',
      }),
    ).rejects.toThrow('Mật khẩu tối thiểu 8 ký tự');
  });

  it('email không hợp lệ → 400 "Email không hợp lệ"', async () => {
    const { service } = makeService();
    await expect(
      service.register({
        name: 'Khách A',
        phone: '0901112222',
        email: 'khong-phai-email',
        password: 'MatKhau@123',
      }),
    ).rejects.toThrow('Email không hợp lệ');
  });

  it('thành công: tạo Customer + User, lưu hash refresh, trả 2 token', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.customer.findUnique.mockResolvedValue(null);
    const tx = {
      customer: {
        create: jest
          .fn<Promise<{ id: string }>, [CreateUserArg]>()
          .mockResolvedValue({ id: 'c1' }),
      },
      user: {
        create: jest
          .fn<Promise<UserRow>, [CreateUserArg]>()
          .mockResolvedValue(baseUser),
      },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    );

    const result = await service.register({
      name: 'Khách A',
      phone: '0901112222',
      password: 'MatKhau@123',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toHaveLength(64);
    expect(result.user).toEqual({
      id: 'u1',
      name: 'Khách A',
      phone: '0901112222',
      email: null,
      role: 'customer',
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshTokenHash: sha256(result.refreshToken) },
    });
    const payload = jwt.verify<{ sub: string; role: string }>(
      result.accessToken,
      { secret: SECRET },
    );
    expect(payload).toMatchObject({ sub: 'u1', role: 'customer' });
    const userCreateArg = tx.user.create.mock.calls[0][0];
    expect(userCreateArg).toMatchObject({
      data: {
        phone: '0901112222',
        role: 'customer',
        customerId: 'c1',
      },
    });
    const customerCreateArg = tx.customer.create.mock.calls[0][0];
    expect(customerCreateArg).toMatchObject({
      data: { name: 'Khách A', phone: '0901112222' },
    });
  });
});

describe('AuthService.login', () => {
  it('user không tồn tại → 401', async () => {
    const { service, prisma } = makeService();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.login({ phoneOrEmail: '0988888888', password: 'x' }),
    ).rejects.toThrow('Số điện thoại/email hoặc mật khẩu không đúng');
  });

  it('sai mật khẩu → 401', async () => {
    const { service, prisma } = makeService();
    const user: UserRow = {
      ...baseUser,
      passwordHash: await argon2.hash('MatKhau@123'),
    };
    prisma.user.findFirst.mockResolvedValue(user);
    await expect(
      service.login({ phoneOrEmail: '0901112222', password: 'sai-mat-khau' }),
    ).rejects.toThrow('Số điện thoại/email hoặc mật khẩu không đúng');
  });

  it('tài khoản bị khóa → 403 "Tài khoản đã bị khóa"', async () => {
    const { service, prisma } = makeService();
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      active: false,
      passwordHash: await argon2.hash('MatKhau@123'),
    });
    await expect(
      service.login({ phoneOrEmail: '0901112222', password: 'MatKhau@123' }),
    ).rejects.toThrow('Tài khoản đã bị khóa');
  });

  it('thành công: cập nhật lastLoginAt, trả token + user', async () => {
    const { service, prisma, jwt } = makeService();
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      passwordHash: await argon2.hash('MatKhau@123'),
      customer: { name: 'Khách Test' },
      stylist: null,
    });
    const result = await service.login({
      phoneOrEmail: '0901112222',
      password: 'MatKhau@123',
    });
    expect(result.user.name).toBe('Khách Test');
    const loginUpdateArg = (
      prisma.user.update.mock.calls as unknown as UserUpdateArg[][]
    )[0][0];
    expect(loginUpdateArg.where).toEqual({ id: 'u1' });
    expect(loginUpdateArg.data.lastLoginAt).toBeInstanceOf(Date);
    const payload = jwt.verify<{ sub: string; role: string }>(
      result.accessToken,
      { secret: SECRET },
    );
    expect(payload).toMatchObject({ sub: 'u1', role: 'customer' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshTokenHash: sha256(result.refreshToken) },
    });
  });
});

describe('AuthService.refresh', () => {
  it('token không tồn tại → 401 "Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại"', async () => {
    const { service, prisma } = makeService();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.refresh('token-khong-ton-tai')).rejects.toThrow(
      'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại',
    );
  });

  it('token cũ sau rotation (không khớp hash) → 401, không cấp token mới', async () => {
    const { service, prisma } = makeService();
    // Hash hiện tại là của token khác → tra theo hash token cũ không ra user
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.refresh('token-cu-da-bi-thay')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refresh đúng: rotation — token mới + hash mới được lưu', async () => {
    const { service, prisma, jwt } = makeService();
    const oldRefresh = generateRefreshToken();
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      refreshTokenHash: sha256(oldRefresh),
      customer: { name: 'Khách Test' },
      stylist: null,
    });

    const result = await service.refresh(oldRefresh);
    expect(result.refreshToken).not.toBe(oldRefresh);
    expect(result.accessToken).toBeDefined();
    const payload = jwt.verify<{ sub: string; role: string }>(
      result.accessToken,
      { secret: SECRET },
    );
    expect(payload.sub).toBe('u1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshTokenHash: sha256(result.refreshToken) },
    });
  });
});

describe('AuthService.logout', () => {
  it('token đúng → xóa hash, trả success', async () => {
    const { service, prisma } = makeService();
    const refresh = generateRefreshToken();
    prisma.user.findFirst.mockResolvedValue({
      ...baseUser,
      refreshTokenHash: sha256(refresh),
    });
    const result = await service.logout(refresh);
    expect(result).toEqual({ success: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { refreshTokenHash: null },
    });
  });

  it('token sai → vẫn trả success (idempotent), không update', async () => {
    const { service, prisma } = makeService();
    prisma.user.findFirst.mockResolvedValue(null);
    const result = await service.logout('token-sai');
    expect(result).toEqual({ success: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.getMe', () => {
  it('user không tồn tại → 401', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.getMe('u-x')).rejects.toThrow(UnauthorizedException);
  });

  it('trả thông tin user + name từ liên kết customer', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      customer: { name: 'Khách Test' },
      stylist: null,
    });
    const me = await service.getMe('u1');
    expect(me).toMatchObject({
      id: 'u1',
      phone: '0901112222',
      role: 'customer',
      customerId: 'c1',
      name: 'Khách Test',
    });
  });
});
