const fs = require('fs');
const { Client } = require('pg');
const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
const connectionString = line.replace(/^\s*DATABASE_URL=/, '').trim();

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  const u = await c.query(`SELECT id FROM users WHERE username = 'premium' LIMIT 1`);
  const id = u.rows[0]?.id;
  if (!id) throw new Error('premium user not found');
  await c.query(
    `UPDATE users SET login_approved = true, login_approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id],
  );
  const check = await c.query(`SELECT login_approved FROM users WHERE id = $1`, [id]);
  console.log('approve ok, login_approved =', check.rows[0].login_approved);
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
