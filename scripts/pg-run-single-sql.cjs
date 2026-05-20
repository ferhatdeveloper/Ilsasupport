/**
 * Tek bir SQL dosyasını .env.local içindeki DATABASE_URL ile çalıştırır.
 * Örnek: npm run db:migrate:hide-history
 *        node scripts/pg-run-single-sql.cjs sql/11_user_download_history_user_hide.sql
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(
      '.env.local bulunamadı. .env.example dosyasını kopyalayıp DATABASE_URL ekleyin.',
    );
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((l) => /^\s*DATABASE_URL=/.test(l));
  if (!line) throw new Error('.env.local içinde DATABASE_URL= satırı yok.');
  return line.replace(/^\s*DATABASE_URL=/, '').trim().replace(/^["']|["']$/g, '');
}

async function main() {
  const rel = process.argv[2];
  if (!rel) {
    console.error('Kullanım: node scripts/pg-run-single-sql.cjs <sql-yolu>');
    console.error('Örnek: node scripts/pg-run-single-sql.cjs sql/11_user_download_history_user_hide.sql');
    process.exit(1);
  }

  const fp = path.isAbsolute(rel) ? rel : path.join(__dirname, '..', rel);
  if (!fs.existsSync(fp)) throw new Error(`Dosya yok: ${fp}`);

  const connectionString = loadDatabaseUrl();
  const client = new Client({ connectionString });
  await client.connect();

  const sqlText = fs.readFileSync(fp, 'utf8');
  process.stdout.write(`→ ${path.relative(path.join(__dirname, '..'), fp)} ... `);
  await client.query(sqlText);
  process.stdout.write('ok\n');

  await client.end();
  console.log('Bitti.');
}

main().catch((e) => {
  console.error('\nHata:', e.message || e);
  process.exit(1);
});
