import * as mem from './memory_cache.ts';
import * as redis from './redis_cache.ts';

const PREFIX = (Deno.env.get('CACHE_KEY_PREFIX') || 'ilsa').trim() || 'ilsa';

function fullKey(key: string): string {
  return `${PREFIX}:${key}`;
}

export function cacheBackend(): 'redis' | 'memory' {
  return redis.isRedisConfigured() ? 'redis' : 'memory';
}

export async function cacheGet(key: string): Promise<string | null> {
  const k = fullKey(key);
  if (redis.isRedisConfigured()) {
    const v = await redis.redisGet(k);
    if (v != null) return v;
  }
  return mem.memGet(k);
}

export async function cacheSet(key: string, value: string, ttlSec: number): Promise<void> {
  const k = fullKey(key);
  if (redis.isRedisConfigured()) {
    const ok = await redis.redisSet(k, value, ttlSec);
    if (ok) return;
  }
  mem.memSet(k, value, ttlSec);
}

export async function cacheDel(key: string): Promise<void> {
  const k = fullKey(key);
  await redis.redisDel(k);
  mem.memDel(k);
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  await cacheSet(key, JSON.stringify(value), ttlSec);
}

export async function cacheHealth(): Promise<{
  configured: boolean;
  connected: boolean;
}> {
  const configured = redis.isRedisConfigured();
  if (!configured) {
    return { configured: false, connected: false };
  }
  const connected = await redis.redisPing();
  return { configured, connected };
}
