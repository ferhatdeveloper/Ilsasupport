/**
 * Yerel PostgreSQL'e sql/* standalone şemasını uygular.
 * Gereksinim: .env.local içinde DATABASE_URL
 * Çalıştır: npm run db:schema
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(
      '.env.local bulunamadı. .env.example dosyasını kopyalayıp DATABASE_URL ekleyin.'
    );
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
  if (!line) throw new Error('.env.local içinde DATABASE_URL= satırı yok.');
  return line.replace(/^\s*DATABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const connectionString = loadDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  const files = [
    '00_plain_postgres_prereqs.sql',
    '01_app_database_setup_standalone.sql',
    '02_schema_legacy_ilsa_standalone.sql',
    '03_pg_runtime_tables.sql',
    '11_user_download_history_user_hide.sql',
    '04_rpc_and_helpers.sql',
    '09_cms_content.sql',
    '10_cms_pricing.sql',
    '12_performance_indexes.sql',
    '20_search_trgm_indexes.sql',
  ];

  for (const f of files) {
    const fp = path.join(__dirname, '..', 'sql', f);
    if (!fs.existsSync(fp)) throw new Error(`Dosya yok: ${fp}`);
    const sql = fs.readFileSync(fp, 'utf8');
    process.stdout.write(`→ ${f} ... `);
    await client.query(sql);
    process.stdout.write('ok\n');
  }

  await client.end();
  console.log('Bitti: tablolar ve fonksiyonlar oluşturuldu.');
}

main().catch((e) => {
  console.error('\nHata:', e.message || e);
  process.exit(1);
});
