/**
 * CLI seed: `npm run seed` — idempotent, an toàn khi chạy lại nhiều lần.
 */
import { PrismaClient } from '@prisma/client';
import { seedAll } from './seed-data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedAll(prisma);
  const [branches, services, stylists, users] = await Promise.all([
    prisma.branch.count(),
    prisma.service.count(),
    prisma.stylist.count(),
    prisma.user.count(),
  ]);
  process.stdout.write(
    `Seed hoàn tất: ${branches} chi nhánh, ${services} dịch vụ, ${stylists} stylist, ${users} tài khoản.\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`Seed thất bại: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
