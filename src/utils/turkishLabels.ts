/** Plan adları — CSS `uppercase` Türkçe i/İ bozar */
export function formatPlanLabel(plan: string | undefined | null): string {
  const key = String(plan ?? '').trim().toLowerCase();
  const labels: Record<string, string> = {
    free: 'Ücretsiz',
    premium: 'Premium',
    admin: 'Yönetici',
  };
  if (labels[key]) return labels[key];
  if (!key) return '—';
  return key.charAt(0).toLocaleUpperCase('tr-TR') + key.slice(1).toLocaleLowerCase('tr-TR');
}
