import { cacheDel, cacheGetJson, cacheSetJson } from './cache/index.ts';

const TTL_SEC = Math.min(300, Math.max(30, parseInt(Deno.env.get('USER_CACHE_TTL_SEC') || '120', 10) || 120));

export async function getCachedUserKv(userId: string): Promise<Record<string, unknown> | null> {
  return await cacheGetJson<Record<string, unknown>>(`userkv:${userId}`);
}

export async function setCachedUserKv(userId: string, data: Record<string, unknown>): Promise<void> {
  await cacheSetJson(`userkv:${userId}`, data, TTL_SEC);
}

export async function invalidateCachedUserKv(userId: string): Promise<void> {
  await cacheDel(`userkv:${userId}`);
}
