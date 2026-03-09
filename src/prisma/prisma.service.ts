import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'prisma/client/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    super({ adapter: pool });
  }
  async onModuleInit() {
    // Note: this is optional
    await this.$connect();
  }

  generateUserId(): string {
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${yearSuffix}${random}`;
  }

  async createUserWithUniqueId<T>(createFn: (id: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await createFn(this.generateUserId());
      } catch (e: any) {
        const isIdConflict =
          e?.code === 'P2002' &&
          (e?.meta?.target as string[] | undefined)?.includes('id');
        if (isIdConflict && attempt < 4) continue;
        throw e;
      }
    }
    throw new Error('Không thể tạo ID duy nhất sau nhiều lần thử');
  }
}