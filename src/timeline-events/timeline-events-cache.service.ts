import { Injectable } from '@nestjs/common';
import { TtlCache } from '../common/cache/ttl-cache';

@Injectable()
export class TimelineEventsCacheService {
  private readonly lists: TtlCache<unknown[]>;
  private readonly details: TtlCache<unknown>;

  constructor() {
    const ttlMs = Number(process.env.TIMELINE_CACHE_TTL_MS ?? 60_000);
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60_000;
    this.lists = new TtlCache<unknown[]>(ttl);
    this.details = new TtlCache<unknown>(ttl);
  }

  buildListKey(userId: string, page: number, limit: number): string {
    return `${userId}|${page}|${limit}`;
  }

  getList(userId: string, page: number, limit: number): unknown[] | undefined {
    return this.lists.get(this.buildListKey(userId, page, limit));
  }

  setList(userId: string, page: number, limit: number, value: unknown[]): void {
    this.lists.set(this.buildListKey(userId, page, limit), value);
  }

  getDetail(id: number): unknown | undefined {
    return this.details.get(String(id));
  }

  setDetail(id: number, value: unknown): void {
    this.details.set(String(id), value);
  }

  invalidateAll(): void {
    this.lists.clear();
    this.details.clear();
  }

  invalidateUser(userId: string): void {
    // TtlCache has no prefix delete; clear lists entirely (small cache).
    this.lists.clear();
    this.details.clear();
  }
}
