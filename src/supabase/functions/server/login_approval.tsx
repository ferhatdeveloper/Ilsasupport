/**
 * Hesap ve cihaz giriş onayı — tüm girişler admin onayından geçer.
 */
import * as db from './db_helpers.tsx';
import * as kv from './kv_store.tsx';

export type LoginGateResult =
  | { allowed: true }
  | {
      allowed: false;
      status: number;
      error: string;
      errorCode:
        | 'LOGIN_PENDING_APPROVAL'
        | 'LOGIN_REJECTED'
        | 'DEVICE_PENDING_APPROVAL'
        | 'DEVICE_REJECTED'
        | 'HARDWARE_MISMATCH';
      registeredDevice?: unknown;
    };

export function isAdminAccount(
  row: { role?: string; plan?: string },
  userData?: { role?: string; plan?: string },
): boolean {
  return (
    row.role === 'admin' ||
    userData?.role === 'admin' ||
    row.plan === 'admin' ||
    userData?.plan === 'admin'
  );
}

/** @deprecated isAdminAccount kullanın */
function isAdminUser(
  row: { role?: string; plan?: string },
  userData?: { role?: string; plan?: string },
) {
  return isAdminAccount(row, userData);
}

export function readLoginApproved(
  row: { login_approved?: boolean; legacy_profile?: { loginApproved?: boolean }; role?: string; plan?: string },
  userData?: { loginApproved?: boolean; role?: string; plan?: string },
): boolean {
  if (isAdminAccount(row, userData)) return true;
  if (row.login_approved === true) return true;
  if (row.login_approved === false) return false;
  const lp = row.legacy_profile;
  if (lp && typeof lp === 'object' && lp.loginApproved === true) return true;
  if (userData?.loginApproved === true) return true;
  return false;
}

/** Yönetici: hesap onayı + isteğe bağlı cihaz — başka yerden onay gerekmez */
export async function ensureAdminLoginReady(
  userId: string,
  row: { role?: string; plan?: string },
  userData: { role?: string; plan?: string } | undefined,
  opts?: { deviceId?: string; hardwareId?: string; deviceInfo?: unknown },
) {
  if (!isAdminAccount(row, userData)) return;

  const uid = String(userId ?? '').trim();
  if (!uid) return;

  const { getSql } = await import('./pg_client.ts');
  const s = getSql();
  await s`
    UPDATE users SET
      login_approved = true,
      login_approved_at = COALESCE(login_approved_at, NOW()),
      updated_at = NOW()
    WHERE id = ${uid}::uuid
  `;

  let kvData = await kv.get(`user:${uid}`);
  if (!kvData) {
    kvData = { id: uid, role: row.role, plan: row.plan };
  }
  kvData.loginApproved = true;
  kvData.loginApprovedAt = kvData.loginApprovedAt ?? new Date().toISOString();
  if (opts?.deviceId) {
    kvData.registeredDeviceId = opts.deviceId;
  }
  await kv.set(`user:${uid}`, kvData);

  const hw = opts?.hardwareId?.trim();
  if (hw) {
    await approveLoginDevice(uid, hw, opts.deviceInfo ?? { adminAuto: true });
  }
}

export async function setUserLoginApproved(userId: string, approved: boolean) {
  const uid = String(userId ?? '').trim();
  if (!uid) throw new Error('Geçersiz kullanıcı kimliği');

  const { getSql } = await import('./pg_client.ts');
  const s = getSql();
  const rows = await s`
    UPDATE users SET
      login_approved = ${approved},
      login_approved_at = CASE WHEN ${approved} THEN NOW() ELSE NULL END,
      updated_at = NOW()
    WHERE id = ${uid}::uuid
    RETURNING id
  `;
  if (!rows.length) throw new Error('Kullanıcı bulunamadı');

  try {
    const userData = await kv.get(`user:${uid}`);
    if (userData) {
      userData.loginApproved = approved;
      userData.loginApprovedAt = approved ? new Date().toISOString() : null;
      await kv.set(`user:${uid}`, userData);
    }
  } catch (kvErr) {
    console.warn('setUserLoginApproved KV güncellenemedi (PG kaydı güncellendi):', kvErr);
  }
}

export async function upsertPendingLoginDevice(
  userId: string,
  hardwareId: string,
  deviceInfo?: unknown,
  deviceId?: string,
) {
  const s = (await import('./pg_client.ts')).getSql();
  await s`
    INSERT INTO user_login_devices (user_id, hardware_id, device_id, device_info, status, last_attempt_at, updated_at)
    VALUES (
      ${userId}::uuid,
      ${hardwareId},
      ${deviceId ?? null},
      ${JSON.stringify(deviceInfo ?? {})}::jsonb,
      'pending',
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, hardware_id) DO UPDATE SET
      device_id = COALESCE(EXCLUDED.device_id, user_login_devices.device_id),
      device_info = COALESCE(EXCLUDED.device_info, user_login_devices.device_info),
      status = CASE
        WHEN user_login_devices.status = 'approved' THEN 'approved'
        WHEN user_login_devices.status = 'rejected' THEN 'rejected'
        ELSE 'pending'
      END,
      last_attempt_at = NOW(),
      updated_at = NOW()
  `;
}

export async function getLoginDevice(userId: string, hardwareId: string) {
  const s = (await import('./pg_client.ts')).getSql();
  const rows = await s`
    SELECT * FROM user_login_devices
    WHERE user_id = ${userId}::uuid AND hardware_id = ${hardwareId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getApprovedHardwareId(userId: string): Promise<string | null> {
  const row = await db.getUserById(userId);
  if (row?.registered_hardware_id) return String(row.registered_hardware_id);
  const s = (await import('./pg_client.ts')).getSql();
  const rows = await s`
    SELECT hardware_id FROM user_login_devices
    WHERE user_id = ${userId}::uuid AND status = 'approved'
    ORDER BY approved_at DESC NULLS LAST
    LIMIT 1
  `;
  return rows[0]?.hardware_id ? String(rows[0].hardware_id) : null;
}

/** Eski veri: birden fazla onaylı cihaz varsa yalnızca birincil/birincil kayıt kalır */
export async function normalizeSingleApprovedDevice(userId: string): Promise<void> {
  const keep = await getApprovedHardwareId(userId);
  if (!keep) return;
  const s = (await import('./pg_client.ts')).getSql();
  await s`
    UPDATE user_login_devices
    SET status = 'pending', approved_at = NULL, updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND status = 'approved'
      AND hardware_id != ${keep}
  `;
}

/** Electron / donanım kimlikli giriş öncesi kontrol */
export async function gateElectronLogin(
  userId: string,
  row: Parameters<typeof readLoginApproved>[0] & { role?: string; registered_device_info?: unknown },
  userData: Parameters<typeof readLoginApproved>[1] | undefined,
  hardwareId: string,
  deviceInfo?: unknown,
): Promise<LoginGateResult> {
  if (isAdminUser(row, userData)) {
    return { allowed: true };
  }

  if (!readLoginApproved(row, userData)) {
    return {
      allowed: false,
      status: 403,
      error:
        'Hesabınız henüz onaylanmadı. Yönetici onayından sonra giriş yapabilirsiniz.',
      errorCode: 'LOGIN_PENDING_APPROVAL',
    };
  }

  const hw = String(hardwareId ?? '').trim();
  if (!hw) {
    return {
      allowed: false,
      status: 400,
      error: 'Cihaz kimliği alınamadı. Uygulamayı yeniden başlatın.',
      errorCode: 'DEVICE_ID_REQUIRED',
    };
  }

  const dev = await getLoginDevice(userId, hw);
  if (dev?.status === 'rejected') {
    return {
      allowed: false,
      status: 403,
      error: 'Bu cihaz için giriş reddedildi. Destek ile iletişime geçin.',
      errorCode: 'DEVICE_REJECTED',
    };
  }

  if (dev?.status === 'approved' || row.registered_hardware_id === hw) {
    if (dev?.status !== 'approved') {
      await approveLoginDevice(userId, hw, deviceInfo ?? { syncFromRegistered: true });
    }
    return { allowed: true };
  }

  const approvedHw = await getApprovedHardwareId(userId);

  // İlk kayıtlı cihaz: yönetici onayı olmadan otomatik onaylanır
  if (!approvedHw) {
    await approveLoginDevice(userId, hw, deviceInfo ?? { autoFirstDevice: true });
    return { allowed: true };
  }

  if (approvedHw !== hw) {
    await upsertPendingLoginDevice(userId, hw, deviceInfo);
    const shortHw = hw.length > 12 ? `${hw.slice(0, 8)}…${hw.slice(-4)}` : hw;
    return {
      allowed: false,
      status: 403,
      error:
        `Bu hesap başka bir onaylı cihaza bağlıdır. Yönetici panelinde «${shortHw}» cihazını onaylatın.`,
      errorCode: 'HARDWARE_MISMATCH',
      registeredDevice: row.registered_device_info,
      pendingHardwareId: hw,
    };
  }

  await upsertPendingLoginDevice(userId, hw, deviceInfo);
  return {
    allowed: false,
    status: 403,
    error:
      'Cihazınız onay bekliyor. Yönetici onayladıktan sonra tekrar giriş yapın.',
    errorCode: 'DEVICE_PENDING_APPROVAL',
  };
}

/** Web /signin — admin web istisna, diğerleri hesap onayı */
export async function gateWebLogin(
  row: Parameters<typeof readLoginApproved>[0] & { role?: string },
  userData: Parameters<typeof readLoginApproved>[1] | undefined,
  opts?: { isWebAdmin?: boolean },
): Promise<LoginGateResult> {
  if (isAdminUser(row, userData) || opts?.isWebAdmin) {
    return { allowed: true };
  }
  if (!readLoginApproved(row, userData)) {
    return {
      allowed: false,
      status: 403,
      error:
        'Hesabınız henüz onaylanmadı. Yönetici onayından sonra giriş yapabilirsiniz.',
      errorCode: 'LOGIN_PENDING_APPROVAL',
    };
  }
  return { allowed: true };
}

export async function approveLoginDevice(userId: string, hardwareId: string, deviceInfo?: unknown) {
  const s = (await import('./pg_client.ts')).getSql();
  // Tek aktif onaylı cihaz: diğer onaylı kayıtlar beklemeye alınır
  await s`
    UPDATE user_login_devices
    SET status = 'pending', approved_at = NULL, updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND hardware_id != ${hardwareId}
      AND status = 'approved'
  `;
  await s`
    INSERT INTO user_login_devices (user_id, hardware_id, device_info, status, approved_at, last_attempt_at, updated_at)
    VALUES (
      ${userId}::uuid,
      ${hardwareId},
      ${JSON.stringify(deviceInfo ?? { approvedByAdmin: true })}::jsonb,
      'approved',
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, hardware_id) DO UPDATE SET
      status = 'approved',
      approved_at = NOW(),
      updated_at = NOW(),
      device_info = COALESCE(EXCLUDED.device_info, user_login_devices.device_info)
  `;
  await db.registerHardwareId(userId, hardwareId, deviceInfo ?? { approvedByAdmin: true });
  const userData = await kv.get(`user:${userId}`);
  if (userData) {
    userData.hardwareId = hardwareId;
    userData.registeredDeviceId = hardwareId;
    userData.registeredAt = new Date().toISOString();
    await kv.set(`user:${userId}`, userData);
  }
}

export async function rejectLoginDevice(userId: string, hardwareId: string) {
  const s = (await import('./pg_client.ts')).getSql();
  await s`
    UPDATE user_login_devices SET status = 'rejected', updated_at = NOW()
    WHERE user_id = ${userId}::uuid AND hardware_id = ${hardwareId}
  `;
}
