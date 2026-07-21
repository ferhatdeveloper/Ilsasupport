/**
 * Gerçek kv.set ile expiresAt korunur mu?
 * deno run -A --env-file=.env.local scripts/test-kv-expires-preserve.ts
 */
import * as kv from '../src/supabase/functions/server/kv_store.tsx';
import { getSql } from '../src/supabase/functions/server/pg_client.ts';

const testExp = new Date(Date.now() + 60 * 86400000).toISOString();
const s = getSql();

const uid = crypto.randomUUID();
const uname = `kv_exp_test_${uid.slice(0, 8)}`;
const rows = await s`
  INSERT INTO users (id, username, email, password_hash, name, role, plan, legacy_profile)
  VALUES (
    ${uid}::uuid,
    ${uname},
    NULL,
    'x',
    'KV Test',
    'user',
    'premium',
    ${s.json({ kvPlan: 'premium', expiresAt: testExp })}
  )
  RETURNING id::text AS id
`;
const userId = String(rows[0].id);

await kv.set(`user:${userId}`, {
  id: userId,
  username: 'kv_expires_preserve_test',
  name: 'KV Test',
  role: 'user',
  plan: 'premium',
  activeSessions: 3,
  downloadCount: 1,
});

const after = await kv.get(`user:${userId}`);
const ok = after?.expiresAt === testExp;

await s`DELETE FROM users WHERE id = ${userId}::uuid`;

if (ok) {
  console.log('[OK] kv.set sonrası expiresAt korundu:', after.expiresAt);
} else {
  console.error('[HATA] expiresAt kayboldu. Beklenen:', testExp, 'Gelen:', after?.expiresAt);
  Deno.exit(1);
}
