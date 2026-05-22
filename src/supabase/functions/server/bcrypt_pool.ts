/**
 * Girişte bcrypt CPU tıkanmasını önler — eşzamanlı doğrulama limiti.
 */
import * as pwd from './password.tsx';

const MAX_PARALLEL = Math.min(
  32,
  Math.max(2, parseInt(Deno.env.get('BCRYPT_MAX_PARALLEL') || '12', 10) || 12),
);
let active = 0;
const waiters: Array<() => void> = [];

function release(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

async function acquire(): Promise<void> {
  if (active < MAX_PARALLEL) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

export async function verifyPasswordPooled(plain: string, hash: string): Promise<boolean> {
  await acquire();
  try {
    return await pwd.verifyPassword(plain, hash);
  } finally {
    release();
  }
}
