-- Yöneticiler: giriş onayı zorunlu değil
UPDATE users
SET login_approved = true,
    login_approved_at = COALESCE(login_approved_at, NOW())
WHERE role = 'admin' OR plan = 'admin';
