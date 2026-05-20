import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash || hash.length < 10) return false;
  return await bcrypt.compare(plain, hash);
}
