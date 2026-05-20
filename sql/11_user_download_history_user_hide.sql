-- Kullanıcı indirme geçmişinde "Sil" / gizle: kayıt DB'de kalır, listede görünmez; yönetici tüm kayıtları görebilir.
ALTER TABLE user_download_history
  ADD COLUMN IF NOT EXISTS hidden_from_user BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE user_download_history
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
