import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, PoolClient } from 'pg';
import { PrismaClient } from 'prisma/client/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
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
    await this.warmPool();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  /** Keep remote connections alive so the next request avoids cold TCP/auth. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async keepPoolWarm(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn(
        `Pool keepalive failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async warmPool(): Promise<void> {
    const min = Math.max(1, Number(process.env.DB_POOL_MIN ?? 2));
    const clients: PoolClient[] = [];

    try {
      for (let i = 0; i < min; i++) {
        clients.push(await this.pool.connect());
      }
      await Promise.all(clients.map((client) => client.query('SELECT 1')));
      this.logger.log(`Warmed pg pool with ${clients.length} connection(s)`);
    } catch (error) {
      this.logger.warn(
        `Failed to warm pg pool: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      for (const client of clients) {
        client.release();
      }
    }
  }

  generateUserId(): string {
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const random = Math.floor(Math.random() * 100_000_000)
      .toString()
      .padStart(8, '0');
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
