
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client/client';

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter: pool });

function generateUserId(): string {
  const yearSuffix = new Date().getFullYear().toString().slice(-2);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${yearSuffix}${random}`;
}

async function main() {
  console.log('Start seeding...');

  // Hash password mặc định
  const defaultPassword = await bcrypt.hash('Password123!', 10);

  // Seed users
  const users = [
    {
      id: generateUserId(),
      email: 'user1@bcn.edu.vn',
      password: defaultPassword,
      fullName: 'Nguyễn Văn A',
      role: 'USER',
      typeAuth: 'EMAIL' as const,
      status: 'ACTIVE' as const,
      phone: '0901234567',
      updatedAt: new Date(),
    },
    {
      id: generateUserId(),
      email: 'user2@bcn.edu.vn',
      password: defaultPassword,
      fullName: 'Trần Thị B',
      role: 'USER',
      typeAuth: 'EMAIL' as const,
      status: 'ACTIVE' as const,
      phone: '0902345678',
      updatedAt: new Date(),
    },
    {
      id: generateUserId(),
      email: 'user3@bcn.edu.vn',
      password: defaultPassword,
      fullName: 'Lê Văn C',
      role: 'USER',
      typeAuth: 'EMAIL' as const,
      status: 'PENDING' as const,
      phone: '0903456789',
      updatedAt: new Date(),
    },
    {
      id: generateUserId(),
      email: 'googleuser@gmail.com',
      password: null,
      fullName: 'Google User',
      role: 'USER',
      typeAuth: 'GOOGLE' as const,
      status: 'ACTIVE' as const,
      googleId: 'google_' + generateUserId(),
      updatedAt: new Date(),
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
    console.log(`Created/Updated user: ${user.email}`);
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
