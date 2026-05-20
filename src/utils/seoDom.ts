import {
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_KEYWORDS,
  SEO_ORG_DESCRIPTION,
  SEO_SITE_NAME,
} from '../constants/seoDefaults';

const MANAGED_ATTR = 'data-ilsa-seo';

export type SeoApplyOptions = {
  /** Tarayıcı sekmesi — "| Site adı" eklenmez; tam başlık verin veya kısa başlık + siteName kullanın */
  title: string;
  description?: string;
  /** pathname + search, ör. / veya /?view=admin */
  path?: string;
  /** Yönetim / özel sayfalar için arama motorlarına kapat */
  noindex?: boolean;
  /** Open Graph görseli — mutlak URL olmalı */
  ogImagePath?: string | null;
  /** Ek hreflang href’leri (tam URL). Varsayılan tr + x-default ana köke eklenir. */
  extraAlternateUrls?: { hreflang: string; href: string }[];
};

function removeManagedNodes(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`[${MANAGED_ATTR}]`).forEach((n) => n.remove());
}

/** Canonical ve OG için site kökü. Üretimde .env ile sabitleyin. */
export function getResolvedSiteUrl(): string {
  const env = String(import.meta.env.VITE_PUBLIC_SITE_URL ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (env) return env;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
}

/** data-ilsa-seo değeri — sadece [A-Za-z0-9_-] (querySelector güvenliği) */
function safeManagedTag(tag: string): string {
  const t = String(tag || 'tag').replace(/[^\w-]/g, '');
  return t || 'tag';
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string, tag: string): void {
  const st = safeManagedTag(tag);
  const sel = `meta[${MANAGED_ATTR}="${st}"]`;
  let el = document.querySelector(sel) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(MANAGED_ATTR, st);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, key);
  el.setAttribute('content', content);
  if (!el.hasAttribute(MANAGED_ATTR)) el.setAttribute(MANAGED_ATTR, st);
}

function upsertLink(rel: string, href: string, extraAttrs: Record<string, string>, tag: string): void {
  const st = safeManagedTag(tag);
  const sel = `link[${MANAGED_ATTR}="${st}"]`;
  let el = document.querySelector(sel) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    for (const [k, v] of Object.entries(extraAttrs)) el.setAttribute(k, v);
    el.setAttribute(MANAGED_ATTR, st);
    document.head.appendChild(el);
  }
  el.setAttribute('rel', rel);
  for (const [k, v] of Object.entries(extraAttrs)) el.setAttribute(k, v);
  el.setAttribute('href', href);
  if (!el.hasAttribute(MANAGED_ATTR)) el.setAttribute(MANAGED_ATTR, st);
}

function setJsonLd(id: string, json: Record<string, unknown> | null): void {
  const sid = `ilsa-seo-jsonld-${id}`;
  document.getElementById(sid)?.remove();
  if (!json) return;
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = sid;
  s.setAttribute(MANAGED_ATTR, `jsonld-${id}`);
  s.textContent = JSON.stringify(json);
  document.head.appendChild(s);
}

/**
 * Belge başlığı, meta, canonical, OG/Twitter, GEO ve JSON-LD uygular.
 * SPA geçişlerinde önceki yönetilen link/meta’lar temizlenir.
 */
export function applySeo(opts: SeoApplyOptions): void {
  if (typeof document === 'undefined') return;

  try {
  const base = getResolvedSiteUrl();
  const path = (opts.path ?? window.location.pathname + window.location.search).split('#')[0] || '/';
  const canonical = base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : '';
  const desc = (opts.description ?? SEO_DEFAULT_DESCRIPTION).slice(0, 320);
  const robots = opts.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  document.title = opts.title;

  removeManagedNodes();

  upsertMeta('name', 'description', desc, 'desc');
  upsertMeta('name', 'keywords', SEO_DEFAULT_KEYWORDS, 'keywords');
  upsertMeta('name', 'robots', robots, 'robots');
  upsertMeta('name', 'googlebot', robots, 'googlebot');
  upsertMeta('name', 'language', 'Turkish', 'language');
  upsertMeta('name', 'geo.region', 'TR', 'geo-region');
  upsertMeta('name', 'geo.placename', 'Turkey', 'geo-placename');
  upsertMeta('name', 'ICBM', '39.9334, 32.8597', 'icbm');
  upsertMeta('property', 'og:locale', 'tr_TR', 'og-locale');
  upsertMeta('property', 'og:locale:alternate', 'en_US', 'og-locale-alt');

  upsertMeta('property', 'og:type', 'website', 'og-type');
  upsertMeta('property', 'og:site_name', SEO_SITE_NAME, 'og-site');
  upsertMeta('property', 'og:title', opts.title, 'og-title');
  upsertMeta('property', 'og:description', desc, 'og-desc');
  if (canonical) upsertMeta('property', 'og:url', canonical, 'og-url');

  const imgPath = opts.ogImagePath ?? '/ilsa-logo.png';
  if (base && imgPath) {
    const ogImg = imgPath.startsWith('http') ? imgPath : `${base}${imgPath.startsWith('/') ? imgPath : `/${imgPath}`}`;
    upsertMeta('property', 'og:image', ogImg, 'og-image');
    upsertMeta('name', 'twitter:card', 'summary_large_image', 'tw-card');
    upsertMeta('name', 'twitter:title', opts.title, 'tw-title');
    upsertMeta('name', 'twitter:description', desc, 'tw-desc');
    upsertMeta('name', 'twitter:image', ogImg, 'tw-img');
  }

  if (canonical) {
    upsertLink('canonical', canonical, {}, 'canonical');
  }

  if (base) {
    const home = `${base}/`;
    upsertLink('alternate', home, { hreflang: 'tr' }, 'hreflang-tr');
    upsertLink('alternate', home, { hreflang: 'x-default' }, 'hreflang-xdef');
    for (const alt of opts.extraAlternateUrls ?? []) {
      upsertLink('alternate', alt.href, { hreflang: alt.hreflang }, `hreflang-${alt.hreflang}`);
    }
  }

  if (base) {
    setJsonLd('website', {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SEO_SITE_NAME,
      url: base,
      description: SEO_DEFAULT_DESCRIPTION,
      inLanguage: 'tr-TR',
    });
    setJsonLd('org', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SEO_SITE_NAME,
      url: base,
      description: SEO_ORG_DESCRIPTION,
      logo: `${base}/ilsa-logo.png`,
    });
  }
  } catch (e) {
    console.error('[applySeo]', e);
  }
}
