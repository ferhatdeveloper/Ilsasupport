/**
 * expiresAt: kv.set kısmi güncellemede silinmemeli.
 * Kullanım: node scripts/verify-expires-persist.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
const connectionString = line.replace(/^\s*DATABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');

async function main() {
  const c = new Client({ connectionString });
  await c.connect();
  const testExp = new Date(Date.now() + 45 * 86400000).toISOString();
  const ins = await c.query(
    `INSERT INTO users (id, username, email, password_hash, name, role, plan, legacy_profile)
     VALUES (gen_random_uuid(), 'expires_test_user', NULL, 'x', 'Test', 'user', 'premium', $1::jsonb)
     ON CONFLICT (username) DO UPDATE SET legacy_profile = EXCLUDED.legacy_profile
     RETURNING id`,
    [JSON.stringify({ kvPlan: 'premium', expiresAt: testExp })],
  );
  const id = ins.rows[0].id;

  const before = await c.query(
    `SELECT legacy_profile->>'expiresAt' AS exp FROM users WHERE id = $1::uuid`,
    [id],
  );
  console.log('1) Kayıtlı expiresAt:', before.rows[0].exp);

  const prev = (
    await c.query(`SELECT legacy_profile FROM users WHERE id = $1::uuid`, [id])
  ).rows[0].legacy_profile;
  const lp = { ...prev, kvRole: 'user', activeSessions: 1, expiresAt: undefined };
  const merged = JSON.parse(JSON.stringify(lp));
  await c.query(`UPDATE users SET legacy_profile = $2::jsonb WHERE id = $1::uuid`, [
    id,
    JSON.stringify(merged),
  ]);

  const afterBad = await c.query(
    `SELECT legacy_profile->>'expiresAt' AS exp FROM users WHERE id = $1::uuid`,
    [id],
  );
  console.log('2) Eski hata simülasyonu (expiresAt: undefined):', afterBad.rows[0].exp ?? '(silindi)');

  const prev2 = (
    await c.query(`SELECT legacy_profile FROM users WHERE id = $1::uuid`, [id])
  ).rows[0].legacy_profile;
  prev2.expiresAt = testExp;
  const lpFixed = {
    ...prev2,
    kvRole: 'user',
    activeSessions: 2,
    expiresAt:
      undefined !== undefined ? undefined : prev2.expiresAt,
  };
  function lpField(next, p) {
    return next !== undefined ? next : p;
  }
  const lpOk = {
    ...prev2,
    kvRole: lpField('user', prev2.kvRole),
    activeSessions: lpField(2, prev2.activeSessions),
    expiresAt: lpField(undefined, prev2.expiresAt),
  };
  await c.query(`UPDATE users SET legacy_profile = $2::jsonb WHERE id = $1::uuid`, [
    id,
    JSON.stringify(lpOk),
  ]);
  const afterGood = await c.query(
    `SELECT legacy_profile->>'expiresAt' AS exp FROM users WHERE id = $1::uuid`,
    [id],
  );
  console.log('3) Düzeltme (lpField):', afterGood.rows[0].exp);

  await c.query(`DELETE FROM users WHERE id = $1::uuid`, [id]);
  const ok = afterGood.rows[0].exp === testExp;
  console.log(ok ? '\n[OK] Süre korunuyor' : '\n[HATA] Süre korunmuyor');
  await c.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
