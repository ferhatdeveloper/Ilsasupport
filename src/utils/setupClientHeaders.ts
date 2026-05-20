/** Kurulum API istekleri: sunucuda SETUP_SECRET varsa aynı değeri .env.local içinde VITE_SETUP_SECRET ile verin (yalnızca güvenilir ortam). */
export function setupJsonHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const s = (import.meta.env.VITE_SETUP_SECRET as string | undefined)?.trim();
  if (s) headers['X-Setup-Secret'] = s;
  return headers;
}
