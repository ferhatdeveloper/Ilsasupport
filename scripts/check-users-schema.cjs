const fs = require('fs');
const { Client } = require('pg');
const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
const connectionString = line.replace(/^\s*DATABASE_URL=/, '').trim();

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY 1`,
  );
  console.log('users columns:', cols.rows.map((r) => r.column_name).join(', '));
  const premium = await c.query(
    `SELECT id, username, plan, login_approved FROM users WHERE username = 'premium' LIMIT 1`,
  );
  console.log('premium row:', premium.rows[0]);
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
