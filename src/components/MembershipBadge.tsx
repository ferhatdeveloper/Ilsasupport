import { useEffect, useState } from 'react';
import { formatMembershipRemainingLabel } from '../utils/membership';
import {
  getBearerForApi,
  getLocalUser,
  refreshUserMembership,
} from '../utils/secureApi';

type Props = {
  user: Record<string, unknown> | null | undefined;
  accessToken: string | null | undefined;
};

function labelFromUser(user: Props['user']): string | null {
  return formatMembershipRemainingLabel(
    user as Parameters<typeof formatMembershipRemainingLabel>[0],
  );
}

/** Üye adının yanında kalan süre — web ve masaüstü oturumunda sunucudan yeniler */
export function MembershipBadge({ user, accessToken }: Props) {
  const [label, setLabel] = useState<string | null>(() => labelFromUser(user));

  useEffect(() => {
    setLabel(labelFromUser(user));
  }, [user]);

  useEffect(() => {
    if (!user || !getBearerForApi(accessToken)) {
      setLabel(null);
      return;
    }

    let cancelled = false;

    const applyFromStorage = () => {
      const local = getLocalUser();
      const next = labelFromUser(local ?? user);
      if (!cancelled) setLabel(next);
    };

    void (async () => {
      const refreshed = await refreshUserMembership();
      if (cancelled) return;
      const next = labelFromUser(
        (refreshed as Record<string, unknown> | null) ?? getLocalUser() ?? user,
      );
      setLabel(next);
    })();

    window.addEventListener('ilsa-jwt-rotated', applyFromStorage);
    window.addEventListener('ilsa-secure-token-rotated', applyFromStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('ilsa-jwt-rotated', applyFromStorage);
      window.removeEventListener('ilsa-secure-token-rotated', applyFromStorage);
    };
  }, [user, accessToken]);

  if (!label) return null;

  return (
    <span className="ilsa-membership-badge" title="Üyelik süresi">
      {label}
    </span>
  );
}
