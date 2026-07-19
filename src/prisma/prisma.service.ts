import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from 'prisma/client/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_MS ?? 60_000),
      connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECT_TIMEOUT_MS ?? 10_000),
      keepAlive: true,
      allowExitOnIdle: false,
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
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
