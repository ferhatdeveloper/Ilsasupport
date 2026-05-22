/**
 * Redis önbellek (ioredis) — REDIS_URL ile etkin.
 */
import Redis from 'npm:ioredis@5.4.1';

const RETRY_AFTER_MS = Math.max(
  5000,
  parseInt(Deno.env.get('REDIS_RETRY_AFTER_MS') || '15000', 10) || 15000,
);

let client: Redis | null = null;
let retryAfter = 0;

function isRedisUrlConfigured(): boolean {
  return !!(Deno.env.get('REDIS_URL') || '').trim();
}

function canAttemptRedis(): boolean {
  if (!isRedisUrlConfigured()) return false;
  if (retryAfter > 0 && Date.now() < retryAfter) return false;
  return true;
}

function markRedisUnavailable(): void {
  retryAfter = Date.now() + RETRY_AFTER_MS;
  try {
    client?.disconnect();
  } catch {
    /* ignore */
  }
  client = null;
}

function getClient(): Redis | null {
  if (!canAttemptRedis()) return null;
  const url = (Deno.env.get('REDIS_URL') || '').trim();
  if (!url) return null;
  if (!client) {
    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 4000,
      });
      client.on('error', (e: Error) => {
        console.warn('[redis]', e.message);
      });
    } catch (e) {
      console.warn('[redis] init failed:', e);
      markRedisUnavailable();
      return null;
    }
  }
  return client;
}

export async function redisGet(key: string): Promise<string | null> {
  const r = getClient();
  if (!r) return null;
  try {
    if (r.status !== 'ready') await r.connect();
    const v = await r.get(key);
    retryAfter = 0;
    return v;
  } catch (e) {
    console.warn('[redis] get:', e);
    markRedisUnavailable();
    return null;
  }
}

export async function redisSet(key: string, value: string, ttlSec: number): Promise<boolean> {
  const r = getClient();
  if (!r) return false;
  try {
    if (r.status !== 'ready') await r.connect();
    await r.setex(key, Math.max(1, ttlSec), value);
    retryAfter = 0;
    return true;
  } catch (e) {
    console.warn('[redis] set:', e);
    markRedisUnavailable();
    return false;
  }
}

export async function redisDel(key: string): Promise<void> {
  const r = getClient();
  if (!r) return;
  try {
    if (r.status !== 'ready') await r.connect();
    await r.del(key);
    retryAfter = 0;
  } catch {
    markRedisUnavailable();
  }
}

/** health-scale ve boot için canlı bağlantı testi */
export async function redisPing(): Promise<boolean> {
  if (!isRedisUrlConfigured()) return false;
  retryAfter = 0;
  const r = getClient();
  if (!r) return false;
  try {
    if (r.status !== 'ready') await r.connect();
    const pong = await r.ping();
    retryAfter = 0;
    return pong === 'PONG';
  } catch (e) {
    console.warn('[redis] ping:', e);
    markRedisUnavailable();
    return false;
  }
}

export function isRedisConfigured(): boolean {
  return isRedisUrlConfigured();
}

export function isRedisConnected(): boolean {
  return !!client && client.status === 'ready' && retryAfter === 0;
}
