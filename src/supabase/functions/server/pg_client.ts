/**
 * Doğrudan PostgreSQL bağlantısı (Supabase PostgREST / supabase-js yok).
 */
import postgres from 'npm:postgres@3.4.5';

let _sql: ReturnType<typeof postgres> | null = null;

export function getSql(): ReturnType<typeof postgres> {
  if (_sql) return _sql;
  const url = Deno.env.get('DATABASE_URL');
  if (!url) {
    throw new Error('DATABASE_URL ortam değişkeni gerekli (PostgreSQL).');
  }
  const maxPool = Math.min(
    100,
    Math.max(10, parseInt(Deno.env.get('PG_POOL_MAX') || '40', 10) || 40),
  );
  _sql = postgres(url, {
    max: maxPool,
    idle_timeout: 30,
    connect_timeout: 15,
  });
  return _sql;
}

/** Postgres hata kodu / mesajı (bazen `cause` zincirinde) */
export function postgresErrorDetail(err: unknown): { code?: string; message: string } {
  let message = '';
  let code: string | undefined;
  let cur: unknown = err;
  const visited = new WeakSet<object>();
  while (cur && typeof cur === 'object') {
    if (visited.has(cur as object)) break;
    visited.add(cur as object);
    const o = cur as Record<string, unknown>;
    if (typeof o.code === 'string' && o.code) code = o.code;
    if (typeof o.message === 'string' && o.message) message = o.message;
    cur = o.cause;
  }
  if (!message && err instanceof Error) message = err.message;
  return { code, message: message || String(err ?? '') };
}
