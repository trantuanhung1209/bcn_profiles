/**
 * Script: reset-passwords.ts
 *
 * Reset password của tất cả user trong DB về mặc định (111111).
 * Chạy: npx ts-node --project tsconfig.json -e "require('dotenv/config')" prisma/reset-passwords.ts
 * hoặc:  npx ts-node -r dotenv/config prisma/reset-passwords.ts
 */

import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client/client';

const DEFAULT_PASSWORD = '111111';

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: pool });

async function main() {
  console.log(`\nResetting all user passwords to "${DEFAULT_PASSWORD}"...`);

  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // Chỉ reset user đăng ký bằng EMAIL (Google OAuth không có password local)
  const result = await prisma.user.updateMany({
    where: { typeAuth: 'EMAIL' },
    data: { password: hashed },
  });

  console.log(`✅ Done — ${result.count} user(s) updated.\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
