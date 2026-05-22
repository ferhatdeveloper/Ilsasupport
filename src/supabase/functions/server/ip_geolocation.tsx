/**
 * IP to location (country, city, ISP). ip-api.com free tier + memory cache.
 */
type IpLocation = {
  ip: string;
  country: string;
  region: string;
  city: string;
  isp: string;
  label: string;
};

const cache = new Map<string, { at: number; data: IpLocation }>();
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

function isPrivateIp(ip: string): boolean {
  const s = ip.trim();
  if (!s || s === 'unknown' || s === '::1' || s === '127.0.0.1') return true;
  if (s.startsWith('10.') || s.startsWith('192.168.') || s.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return true;
  if (s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80')) return true;
  return false;
}

function labelFromParts(parts: {
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
}): string {
  const loc = [parts.city, parts.region, parts.country].filter(Boolean).join(', ');
  if (loc && parts.isp) return `${loc} \u00b7 ${parts.isp}`;
  return loc || parts.isp || 'Konum bilinmiyor';
}

export async function resolveIpLocation(ipAddress: string): Promise<IpLocation> {
  const ip = String(ipAddress || 'unknown').split(',')[0].trim().slice(0, 64);
  if (isPrivateIp(ip)) {
    return {
      ip,
      country: '',
      region: '',
      city: '',
      isp: '',
      label: 'Yerel / \u00f6zel a\u011f',
    };
  }

  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

  try {
    const url =
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,regionName,city,isp,query&lang=tr`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const j = await res.json() as {
      status?: string;
      country?: string;
      regionName?: string;
      city?: string;
      isp?: string;
      query?: string;
    };
    if (j.status !== 'success') {
      const fallback: IpLocation = {
        ip,
        country: '',
        region: '',
        city: '',
        isp: '',
        label: 'Konum al\u0131namad\u0131',
      };
      cache.set(ip, { at: Date.now(), data: fallback });
      return fallback;
    }
    const data: IpLocation = {
      ip: j.query || ip,
      country: j.country || '',
      region: j.regionName || '',
      city: j.city || '',
      isp: j.isp || '',
      label: labelFromParts({
        city: j.city,
        region: j.regionName,
        country: j.country,
        isp: j.isp,
      }),
    };
    cache.set(ip, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.warn('[ip_geolocation]', ip, e);
    return {
      ip,
      country: '',
      region: '',
      city: '',
      isp: '',
      label: 'Konum sorgusu ba\u015far\u0131s\u0131z',
    };
  }
}

export async function resolveManyIpLocations(
  ips: string[],
): Promise<Map<string, IpLocation>> {
  const unique = [...new Set(ips.filter((x) => x && !isPrivateIp(x)))];
  const map = new Map<string, IpLocation>();
  await Promise.all(
    unique.map(async (ip) => {
      map.set(ip, await resolveIpLocation(ip));
    }),
  );
  return map;
}
