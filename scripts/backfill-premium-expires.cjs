/**
 * Premium kullanıcılarda expiresAt boşsa bugünden 30 gün ayarlar (KV + legacy_profile).
 * Kullanım: node scripts/backfill-premium-expires.cjs
 *          node scripts/backfill-premium-expires.cjs --dry-run
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const dryRun = process.argv.includes('--dry-run');
const envPath = path.join(__dirname, '..', '.env.local');
const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
const connectionString = line.replace(/^\s*DATABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');

async function main() {
  const c = new Client({ connectionString });
  await c.connect();
  const r = await c.query(`
    SELECT id, username, legacy_profile
    FROM users
    WHERE role = 'user' AND plan = 'premium'
      AND (legacy_profile->>'expiresAt' IS NULL OR legacy_profile->>'expiresAt' = '')
  `);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`${r.rows.length} premium kullanıcı (süre yok). ${dryRun ? '[dry-run]' : ''}`);
  for (const row of r.rows) {
    const lp =
      row.legacy_profile && typeof row.legacy_profile === 'object' ? { ...row.legacy_profile } : {};
    lp.expiresAt = expiresAt;
    lp.kvPlan = lp.kvPlan || 'premium';
    console.log(`  ${row.username}`);
    if (!dryRun) {
      await c.query(
        `UPDATE users SET legacy_profile = $2::jsonb WHERE id = $1::uuid`,
        [row.id, JSON.stringify(lp)],
      );
    }
  }
  await c.end();
  if (!dryRun) console.log('Tamam. KV senkronu için API üzerinden bir kullanıcı kaydı veya KV patch gerekir.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
