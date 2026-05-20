-- ============================================
-- (İsteğe bağlı) public.users ↔ auth.users
-- ============================================
-- Supabase Auth ile aynı UUID kullanıldığında bütünlük için önerilir.
-- Çalıştırmadan önce: users tablosunda auth'ta olmayan satır olmamalı.
-- ============================================

-- ALTER TABLE users
--   DROP CONSTRAINT IF EXISTS users_auth_fk;

-- ALTER TABLE users
--   ADD CONSTRAINT users_auth_fk
--   FOREIGN KEY (id)
--   REFERENCES auth.users(id)
--   ON DELETE CASCADE;
