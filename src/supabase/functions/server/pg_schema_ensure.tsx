/**
 * Eski / elle oluşturulmuş PostgreSQL şemalarında eksik kolonları giderir.
 * Örn. users tablosunda username yoksa admin setup ve createUser INSERT patlar.
 */
import { getSql, postgresErrorDetail } from './pg_client.ts';
import {
  canonicalLoginUsernameFromUserRow,
  isValidLoginUsername,
  normalizeLoginUsername,
} from './login_username.ts';

export async function ensureUsersUsernameColumn(): Promise<void> {
  const s = getSql();
  try {
    const tbl = await s`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
      LIMIT 1
    `;
    if (!tbl.length) {
      console.warn('[schema] public.users yok — username kolonu atlanıyor');
      return;
    }

    const col = await s`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username'
      LIMIT 1
    `;
    if (!col.length) {
      await s.unsafe('ALTER TABLE users ADD COLUMN username TEXT');
      console.log('[schema] users.username kolonu eklendi');
    }

    const rows = (await s`SELECT id, email, username FROM users`) as {
      id: string;
      email: string | null;
      username: string | null;
    }[];
    const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const claimed = new Set<string>();
    const assigned = new Map<string, string>();

    for (const r of sorted) {
      const id = String(r.id);
      const cur = normalizeLoginUsername(String(r.username ?? ''));
      if (isValidLoginUsername(cur) && !claimed.has(cur)) {
        claimed.add(cur);
        assigned.set(id, cur);
        continue;
      }
      const usernameForCanon =
        isValidLoginUsername(cur) && claimed.has(cur)
          ? null
          : isValidLoginUsername(cur)
            ? String(r.username).trim()
            : null;
      let base = canonicalLoginUsernameFromUserRow({
        id,
        email: r.email,
        username: usernameForCanon,
      });
      let candidate = base;
      let n = 0;
      while (claimed.has(candidate)) {
        n++;
        const suf = `_${n}`;
        const room = Math.max(3, 32 - suf.length);
        candidate = (base.slice(0, room) + suf).toLowerCase();
        if (n > 10000) {
          candidate = normalizeLoginUsername(`u${id.replace(/-/g, '').slice(0, 12)}`);
          if (!isValidLoginUsername(candidate)) candidate = 'user_legacy_fix';
          break;
        }
      }
      claimed.add(candidate);
      assigned.set(id, candidate);
    }

    for (const r of sorted) {
      const id = String(r.id);
      const want = assigned.get(id);
      if (!want) continue;
      const cur = normalizeLoginUsername(String(r.username ?? ''));
      if (want !== cur) {
        await s`UPDATE users SET username = ${want} WHERE id = ${id}::uuid`;
      }
    }

    await s.unsafe('ALTER TABLE users ALTER COLUMN username SET NOT NULL').catch(() => {
      /* zaten NOT NULL */
    });

    await s.unsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username))',
    ).catch((e) => {
      const d = postgresErrorDetail(e);
      console.warn('[schema] idx_users_username_lower oluşturulamadı:', d.code, d.message);
    });
  } catch (e) {
    const d = postgresErrorDetail(e);
    console.error('[schema] ensureUsersUsernameColumn:', d.code, d.message);
    throw e;
  }
}

export async function ensureLoginApprovalSchema(): Promise<void> {
  const s = getSql();
  try {
    const tbl = await s`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
      LIMIT 1
    `;
    if (!tbl.length) return;

    await s.unsafe(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS login_approved BOOLEAN NOT NULL DEFAULT false',
    );
    await s.unsafe(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS login_approved_at TIMESTAMPTZ',
    );
    await s`
      UPDATE users SET login_approved = true, login_approved_at = COALESCE(login_approved_at, NOW())
      WHERE (role = 'admin' OR plan = 'admin') AND login_approved = false
    `;

    await s.unsafe(`
      CREATE TABLE IF NOT EXISTS user_login_devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        hardware_id TEXT NOT NULL,
        device_id TEXT,
        device_info JSONB DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'inactive')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        last_attempt_at TIMESTAMPTZ,
        UNIQUE (user_id, hardware_id)
      )
    `);
    await s.unsafe(
      'CREATE INDEX IF NOT EXISTS idx_user_login_devices_user ON user_login_devices(user_id)',
    );
    console.log('[schema] login_approval şeması hazır');
  } catch (e) {
    const d = postgresErrorDetail(e);
    console.warn('[schema] ensureLoginApprovalSchema:', d.code, d.message);
  }
}

export async function ensureJwtRotatingSessionsSchema(): Promise<void> {
  const s = getSql();
  try {
    await s.unsafe(`
      CREATE TABLE IF NOT EXISTS jwt_access_sessions (
        jti UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        replaced_by_jti UUID,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await s.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_jwt_access_sessions_user_active
        ON jwt_access_sessions(user_id) WHERE consumed_at IS NULL
    `);
    console.log('[schema] jwt_access_sessions hazır');
  } catch (e) {
    const d = postgresErrorDetail(e);
    console.warn('[schema] ensureJwtRotatingSessionsSchema:', d.code, d.message);
  }
}

export async function ensureDesktopAppReleaseSchema(): Promise<void> {
  const s = getSql();
  try {
    await s.unsafe(`
      CREATE TABLE IF NOT EXISTS desktop_app_release (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        required_version TEXT NOT NULL DEFAULT '1.0.0',
        latest_version TEXT NOT NULL DEFAULT '1.0.6',
        download_path TEXT NOT NULL DEFAULT '/downloads/ILSA-Support-Portable-1.0.6.exe',
        release_notes TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await s.unsafe(`
      INSERT INTO desktop_app_release (id, required_version, latest_version, download_path)
      VALUES (1, '1.0.0', '1.0.2', '/downloads/ILSA-Support-Portable-1.0.2.exe')
      ON CONFLICT (id) DO NOTHING
    `);
    await s.unsafe(`
      UPDATE desktop_app_release
      SET
        required_version = '1.0.3',
        latest_version = '1.0.6',
        download_path = '/downloads/ILSA-Support-Portable-1.0.6.exe',
        updated_at = NOW()
      WHERE id = 1
        AND (
          latest_version IS DISTINCT FROM '1.0.6'
          OR download_path IS DISTINCT FROM '/downloads/ILSA-Support-Portable-1.0.6.exe'
        )
    `);
    console.log('[schema] desktop_app_release hazır');
  } catch (e) {
    const d = postgresErrorDetail(e);
    console.warn('[schema] ensureDesktopAppReleaseSchema:', d.code, d.message);
  }
}

export async function ensureFavoritesAndRequestsSchema(): Promise<void> {
  const s = getSql();
  try {
    await s.unsafe(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL,
        file_name TEXT,
        file_meta JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, file_id)
      )
    `);
    await s.unsafe(`
      CREATE TABLE IF NOT EXISTS file_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        brand_hint TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'reviewing', 'done', 'rejected')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('[schema] favorites / file_requests hazır');
  } catch (e) {
    const d = postgresErrorDetail(e);
    console.warn('[schema] ensureFavoritesAndRequestsSchema:', d.code, d.message);
  }
}

/** Arama sorguları için pg_trgm indeksleri (TRANSLATE+LOWER ifadesi ile uyumlu) */
export async function ensureSearchTrgmIndexes(): Promise<void> {
  const s = getSql();
  try {
    await s.unsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await s.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_bilgi_search_norm_trgm ON bilgi USING gin (
        REPLACE(
          LOWER(TRANSLATE(COALESCE(adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')),
          'i̇',
          'i'
        ) gin_trgm_ops
      )
    `);
    await s.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_kategoriler_search_norm_trgm ON kategoriler USING gin (
        REPLACE(
          LOWER(TRANSLATE(COALESCE(kategori_adi, ''), 'İIıŞşĞğÜüÖöÇç', 'iiisSGgUuOoCc')),
          'i̇',
          'i'
        ) gin_trgm_ops
      )
    `);
    console.log('[schema] arama trgm indeksleri hazır');
  } catch (e) {
    const d = postgresErrorDetail(e);
    console.warn('[schema] ensureSearchTrgmIndexes:', d.code, d.message);
  }
}
