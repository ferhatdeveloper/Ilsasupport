-- Hesap ve cihaz giriş onayı
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_approved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_approved_at TIMESTAMPTZ;

-- Yöneticiler her zaman giriş yapabilsin
UPDATE users SET login_approved = true, login_approved_at = COALESCE(login_approved_at, NOW())
WHERE role = 'admin' AND login_approved = false;

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
);

CREATE INDEX IF NOT EXISTS idx_user_login_devices_user ON user_login_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_login_devices_status ON user_login_devices(user_id, status);
