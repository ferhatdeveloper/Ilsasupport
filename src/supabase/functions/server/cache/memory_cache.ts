/**
 * Süreç içi LRU önbellek — Redis yokken veya tek worker'da.
 */
type Entry = { value: string; expiresAt: number };

const store = new Map<string, Entry>();
const MAX_KEYS = 20_000;

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  if (store.size <= MAX_KEYS) return;
  const drop = store.size - MAX_KEYS;
  let i = 0;
  for (const k of store.keys()) {
    store.delete(k);
    if (++i >= drop) break;
  }
}

export function memGet(key: string): string | null {
  const e = store.get(key);
  if (!e) return null;
  if (e.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return e.value;
}

export function memSet(key: string, value: string, ttlSec: number): void {
  prune();
  store.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlSec) * 1000 });
}

export function memDel(key: string): void {
  store.delete(key);
}
