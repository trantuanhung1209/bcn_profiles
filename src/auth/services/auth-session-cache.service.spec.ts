import { AuthSessionCacheService } from './auth-session-cache.service';
import type { RedisService } from '../../redis/redis.service';

function createRedisMock() {
  const store = new Map<string, string>();
  return {
    redis: {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      getJson: jest.fn(async (key: string) => {
        const raw = store.get(key);
        return raw == null ? undefined : JSON.parse(raw);
      }),
      setJson: jest.fn(async (key: string, value: unknown) => {
        store.set(key, JSON.stringify(value));
      }),
      del: jest.fn(async (...keys: string[]) => {
        let n = 0;
        for (const key of keys) {
          if (store.delete(key)) n += 1;
        }
        return n;
      }),
    } as unknown as RedisService,
  };
}

describe('AuthSessionCacheService', () => {
  it('stores and revives user cache', async () => {
    const { redis } = createRedisMock();
    const cache = new AuthSessionCacheService(redis);
    const user = {
      id: 'u1',
      email: 'a@b.c',
      fullName: 'A',
      avatar: null,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    await cache.setUser(user);
    const loaded = await cache.getUser('u1');
    expect(loaded?.email).toBe('a@b.c');
    expect(loaded?.createdAt).toBeInstanceOf(Date);
  });

  it('tracks revoked_before timestamps for session kill', async () => {
    const { redis } = createRedisMock();
    const cache = new AuthSessionCacheService(redis);
    const before = Date.now();
    await cache.setRevokedBefore('u1', before);
    await expect(cache.getRevokedBefore('u1')).resolves.toBe(before);
  });
});
