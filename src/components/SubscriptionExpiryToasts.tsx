import { useEffect, useRef } from 'react';
import { toast } from 'sonner@2.0.3';

const STORAGE_KEY = 'ilsa_sub_toast_v1';

type DayState = { ymd: string; slots: ('am' | 'pm')[] };

function loadState(): DayState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ymd: '', slots: [] };
    const j = JSON.parse(raw) as DayState;
    if (!j || typeof j.ymd !== 'string' || !Array.isArray(j.slots)) return { ymd: '', slots: [] };
    return j;
  } catch {
    return { ymd: '', slots: [] };
  }
}

function saveState(s: DayState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Öğleden önce / sonra günde en fazla bir bildirim */
function slotNow(): 'am' | 'pm' {
  return new Date().getHours() < 14 ? 'am' : 'pm';
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

type Props = { user: Record<string, unknown> | null };

/**
 * Abonelik bitişine 14 gün veya daha az kaldıysa (veya süre dolduysa) günde iki kez (öğleden önce / sonra) toast.
 */
export function SubscriptionExpiryToasts({ user }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user || typeof user.expiresAt !== 'string' || !user.expiresAt) return;
    if (user.role === 'admin' || user.plan === 'admin') return;

    const tick = () => {
      const exp = new Date(user.expiresAt as string);
      if (Number.isNaN(exp.getTime())) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(exp);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);

      if (daysLeft > 14) return;

      const slot = slotNow();
      const cur = loadState();
      const d = ymd(new Date());
      const state: DayState = cur.ymd === d ? cur : { ymd: d, slots: [] };
      if (state.slots.includes(slot)) return;
      state.slots.push(slot);
      saveState(state);

      const bitis = exp.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      const id = `ilsa-sub-${d}-${slot}`;

      if (daysLeft < 0) {
        toast.error(`Üyeliğinizin süresi doldu. Bitiş günü: ${bitis}. Erişiminizi sürdürmek için hesabınızı yenileyin.`, {
          duration: 12_000,
          id: `${id}-exp`,
        });
      } else if (daysLeft === 0) {
        toast.warning(`Üyeliğiniz bugün sona eriyor (${bitis}). Lütfen yenileme yapın.`, {
          duration: 10_000,
          id: `${id}-0`,
        });
      } else if (daysLeft <= 3) {
        toast.warning(`Dikkat: Üyeliğinize yalnızca ${daysLeft} gün kaldı — bitiş: ${bitis}.`, {
          duration: 10_000,
          id: `${id}-crit`,
        });
      } else {
        toast.info(`Üyeliğiniz ${daysLeft} gün sonra sona erecek (bitiş: ${bitis}).`, {
          duration: 9000,
          id: `${id}-info`,
        });
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 45 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.expiresAt, user?.role, user?.plan]);

  return null;
}
