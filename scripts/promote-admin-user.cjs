/**
 * admin kullanıcısını (veya verilen kullanıcı adını) yönetici yapar.
 * Kullanım: node scripts/promote-admin-user.cjs
 *          node scripts/promote-admin-user.cjs myuser
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local bulunamadı (DATABASE_URL gerekli).');
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
  if (!line) throw new Error('.env.local içinde DATABASE_URL= yok.');
  return line.replace(/^\s*DATABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const username = (process.argv[2] || 'admin').trim().toLowerCase();
  const connectionString = loadDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  const before = await client.query(
    `SELECT id, username, role, plan, login_approved FROM users WHERE username = $1 LIMIT 1`,
    [username],
  );
  if (!before.rows[0]) {
    console.error(`Kullanıcı bulunamadı: ${username}`);
    process.exit(1);
  }

  const row = before.rows[0];
  const legacy = await client.query(
    `SELECT legacy_profile FROM users WHERE id = $1::uuid`,
    [row.id],
  );
  const lp =
    legacy.rows[0]?.legacy_profile && typeof legacy.rows[0].legacy_profile === 'object'
      ? { ...legacy.rows[0].legacy_profile }
      : {};
  lp.kvRole = 'admin';
  lp.kvPlan = 'premium';
  lp.maxSessions = 10;
  lp.downloadLimit = -1;

  const updated = await client.query(
    `UPDATE users SET
      role = 'admin',
      plan = 'premium',
      login_approved = true,
      login_approved_at = COALESCE(login_approved_at, NOW()),
      legacy_profile = $2::jsonb,
      updated_at = NOW()
    WHERE id = $1::uuid
    RETURNING id, username, role, plan, login_approved`,
    [row.id, JSON.stringify(lp)],
  );

  console.log('Önce:', before.rows[0]);
  console.log('Sonra:', updated.rows[0]);
  console.log(`✅ "${username}" yönetici olarak ayarlandı. Tarayıcıda çıkış yapıp tekrar giriş yapın.`);
  await client.end();
}

main().catch((e) => {
  console.error('Hata:', e.message || e);
  process.exit(1);
});
