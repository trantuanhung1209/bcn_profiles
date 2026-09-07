import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class TimelineEventsCacheService {
  private readonly ttlMs: number;

  constructor(private readonly redis: RedisService) {
    const raw = Number(process.env.TIMELINE_CACHE_TTL_MS ?? 60_000);
    this.ttlMs = Number.isFinite(raw) && raw > 0 ? raw : 60_000;
  }

  buildListKey(userId: string, page: number, limit: number): string {
    return `${userId}|${page}|${limit}`;
  }

  private listKey(userId: string, page: number, limit: number): string {
    return `timeline:list:${this.buildListKey(userId, page, limit)}`;
  }

  private detailKey(id: number): string {
    return `timeline:detail:${id}`;
  }

  async getList(
    userId: string,
    page: number,
    limit: number,
  ): Promise<unknown[] | undefined> {
    return this.redis.getJson<unknown[]>(this.listKey(userId, page, limit));
  }

  async setList(
    userId: string,
    page: number,
    limit: number,
    value: unknown[],
  ): Promise<void> {
    await this.redis.setJson(this.listKey(userId, page, limit), value, this.ttlMs);
  }

  async getDetail(id: number): Promise<unknown | undefined> {
    return this.redis.getJson(this.detailKey(id));
  }

  async setDetail(id: number, value: unknown): Promise<void> {
    await this.redis.setJson(this.detailKey(id), value, this.ttlMs);
  }

  async invalidateAll(): Promise<void> {
    await this.redis.delByPrefix('timeline:');
  }

  async invalidateUser(_userId: string): Promise<void> {
    await this.invalidateAll();
  }
}
