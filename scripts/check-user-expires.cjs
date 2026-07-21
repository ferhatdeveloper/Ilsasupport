const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env.local');
const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
const connectionString = line.replace(/^\s*DATABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  const r = await c.query(`
    SELECT username, role, plan,
      legacy_profile->>'expiresAt' AS lp_exp,
      legacy_profile->>'kvPlan' AS kv_plan
    FROM users ORDER BY username
  `);
  console.table(r.rows);
  await c.end();
})();
