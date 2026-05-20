/**
 * Paket fiyatları sayfası — varsayılan içerik ve tip tanımları.
 * Yönetim panelinden kaydedilen JSON ile aynı şema.
 */

export type PricingHighlight = { text: string; ok: boolean };

export type PricingPlan = {
  id: string;
  name: string;
  /** Slayt görselleriyle aynı: `/img/slayt/...` veya tam URL; yoksa null */
  imageUrl: string | null;
  ribbon: string | null;
  duration: string | null;
  description: string;
  price: string;
  priceSub: string | null;
  savings: string | null;
  memberTotal: string;
  memberDaily: string;
  highlighted: boolean;
  ctaPrimary: boolean;
  cta: string;
  highlights: PricingHighlight[];
};

export type TableCell = string | 'check' | 'dash';

export type PricingTableSection = {
  title: string;
  rows: { label: string; values: Record<string, TableCell> }[];
};

export type PricingFaqItem = { q: string; a: string };

export type PricingPagePayload = {
  plans: PricingPlan[];
  tableSections: PricingTableSection[];
  faqItems: PricingFaqItem[];
  /** Karşılaştırma tablosunda vurgulanacak plan id (ör. platin) */
  highlightPlanId: string;
};

export const DEFAULT_PRICING_PAGE_PAYLOAD: PricingPagePayload = {
  highlightPlanId: 'platinum',
  plans: [
    {
      id: 'platinum',
      name: 'Platin',
      imageUrl: null,
      ribbon: null,
      duration: null,
      description: '',
      price: '',
      priceSub: null,
      savings: null,
      memberTotal: '',
      memberDaily: '',
      highlighted: true,
      ctaPrimary: true,
      cta: '',
      highlights: [],
    },
    {
      id: 'silver',
      name: 'Gümüş',
      imageUrl: null,
      ribbon: 'STANDART',
      duration: '1 AY',
      description: 'Kısa dönem ihtiyaçlar için başlangıç premium paketi.',
      price: '$9.99',
      priceSub: '~$9,99 / ay',
      savings: null,
      memberTotal: '187 GB / 150 dosya',
      memberDaily: '30 GB / 15 dosya',
      highlighted: false,
      ctaPrimary: false,
      cta: 'Gümüş seç',
      highlights: [
        { text: 'Parola korumalı dosyalar', ok: false },
        { text: 'Yeni çözümlere hızlı erişim', ok: false },
        { text: 'Geniş toplam kota', ok: true },
        { text: 'Günlük kota (orta)', ok: true },
      ],
    },
    {
      id: 'gold',
      name: 'Altın',
      imageUrl: null,
      ribbon: null,
      duration: '3 AY',
      description: 'Dengeli kullanım için 3 aylık avantajlı paket.',
      price: '$29.99',
      priceSub: '~$10,00 / ay',
      savings: null,
      memberTotal: '355 GB / 300 dosya',
      memberDaily: '30 GB / 23 dosya',
      highlighted: false,
      ctaPrimary: false,
      cta: 'Altın seç',
      highlights: [
        { text: 'Parola korumalı dosyalar', ok: false },
        { text: 'Yeni çözümlere hızlı erişim', ok: false },
        { text: 'Geniş toplam kota', ok: true },
        { text: 'Günlük kota (üst)', ok: true },
      ],
    },
    {
      id: 'ultra',
      name: 'Ultra Platin',
      imageUrl: null,
      ribbon: 'KURUMSAL',
      duration: '12 AY',
      description: 'Yoğun hacimli servis merkezleri için maksimum limitler.',
      price: '$99.99',
      priceSub: '~$8,33 / ay',
      savings: null,
      memberTotal: '1000 GB / 1000 dosya',
      memberDaily: '80 GB / 25 dosya',
      highlighted: false,
      ctaPrimary: true,
      cta: 'Ultra’ya geç',
      highlights: [
        { text: 'Parola erişimi', ok: true },
        { text: 'Yeni çözümlere hızlı erişim', ok: true },
        { text: 'En yüksek limitler', ok: true },
        { text: 'Öncelikli kota', ok: true },
      ],
    },
  ],
  tableSections: [
    {
      title: 'TEMEL LİMİTLER',
      rows: [
        {
          label: 'Üye dosyaları (toplam)',
          values: {
            free: '5 GB / 5 dosya',
            platinum: '—',
            silver: '187 GB / 150 dosya',
            gold: '355 GB / 300 dosya',
            ultra: '1000 GB / 1000 dosya',
          },
        },
        {
          label: 'Günlük kullanım limiti',
          values: {
            free: '5 GB / 5 dosya',
            platinum: '—',
            silver: '39 GB / 15 dosya',
            gold: '39 GB / 23 dosya',
            ultra: '80 GB / 25 dosya',
          },
        },
        {
          label: 'Sıfırlama periyodu',
          values: {
            free: 'Her 1 gün',
            platinum: 'Her 1 gün',
            silver: 'Her 1 gün',
            gold: 'Her 1 gün',
            ultra: 'Her 1 gün',
          },
        },
        {
          label: 'Plan süresi',
          values: {
            free: 'Süresi dolmaz',
            platinum: '12 ay',
            silver: '3 ay',
            gold: '6 ay',
            ultra: '12 ay',
          },
        },
      ],
    },
    {
      title: 'ERİŞİM VE GÜVENLİK',
      rows: [
        {
          label: 'İzin verilen cihaz',
          values: {
            free: '1 PC',
            platinum: '1 PC',
            silver: '1 PC',
            gold: '1 PC',
            ultra: '1 PC',
          },
        },
        {
          label: 'Parola korumalı dosyalar',
          values: {
            free: 'dash',
            platinum: 'check',
            silver: 'dash',
            gold: 'dash',
            ultra: 'check',
          },
        },
      ],
    },
    {
      title: 'ÜCRETSİZ DOSYA KOTASI',
      rows: [
        {
          label: 'Ücretsiz dosya bant genişliği',
          values: {
            free: 'Üye olmayan dosyalar',
            platinum: '—',
            silver: '20 GB / 5 dosya',
            gold: '25 GB / 10 dosya',
            ultra: '60 GB / 25 dosya',
          },
        },
      ],
    },
  ],
  faqItems: [
    {
      q: 'Parola korumalı dosyalar nedir?',
      a: 'Bazı özel veya hassas firmware arşivleri ek şifre ile korunur. İlgili ücretli paketlerde bu arşivlerin parolalarına erişim tanımlanabilir.',
    },
    {
      q: 'Günlük limit sıfırlanması nasıl çalışır?',
      a: 'Günlük kota sunucu saatine göre 24 saatte bir sıfırlanır. Kullanılmayan kota devretmez.',
    },
    {
      q: '"Dosya" ve "GB" birlikte neden yazıyor?',
      a: 'Hem toplam veri boyutu hem dosya adedi takip edilir; limite hangi metrikten önce ulaşırsanız o geçerlidir.',
    },
    {
      q: 'Daha sonra yükseltebilir miyim?',
      a: 'Evet. Daha yüksek paket satın alındığında yeni haklar genellikle anında geçerli olur.',
    },
    {
      q: 'Süre bittiğinde ne olur?',
      a: 'Hesap ücretsiz plan limitlerine döner; yenileme için tekrar satın almanız gerekir.',
    },
  ],
};

function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function normalizePlanImageUrl(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s ? s : null;
}

/** API’den gelen eksik alanları varsayılanlarla tamamlar (imageUrl dahil) */
export function normalizePricingPlan(
  p: Partial<PricingPlan> & { image_url?: unknown },
  fallback: PricingPlan,
): PricingPlan {
  const rawImg = p.imageUrl !== undefined ? p.imageUrl : p.image_url;
  const img = normalizePlanImageUrl(rawImg);
  return {
    id: String(p.id || fallback.id).trim() || fallback.id,
    name: String(p.name ?? fallback.name),
    imageUrl: img ?? null,
    ribbon: p.ribbon === undefined ? fallback.ribbon : p.ribbon,
    duration: p.duration === undefined ? fallback.duration : p.duration,
    description: String(p.description ?? fallback.description),
    price: String(p.price ?? fallback.price),
    priceSub: p.priceSub === undefined ? fallback.priceSub : p.priceSub,
    savings: p.savings === undefined ? fallback.savings : p.savings,
    memberTotal: String(p.memberTotal ?? fallback.memberTotal),
    memberDaily: String(p.memberDaily ?? fallback.memberDaily),
    highlighted: typeof p.highlighted === 'boolean' ? p.highlighted : fallback.highlighted,
    ctaPrimary: typeof p.ctaPrimary === 'boolean' ? p.ctaPrimary : fallback.ctaPrimary,
    cta: String(p.cta ?? fallback.cta),
    highlights: Array.isArray(p.highlights) && p.highlights.length > 0 ? p.highlights : [...fallback.highlights],
  };
}

/** Yeni paket şablonu (admin “Paket ekle”) */
export function createNewPricingPlan(id: string, name = 'Yeni paket'): PricingPlan {
  return {
    id,
    name,
    imageUrl: null,
    ribbon: null,
    duration: null,
    description: '',
    price: '',
    priceSub: null,
    savings: null,
    memberTotal: '',
    memberDaily: '',
    highlighted: false,
    ctaPrimary: false,
    cta: 'İletişime geç',
    highlights: [],
  };
}

export function uniquePricingPlanId(existing: PricingPlan[], base = 'yeni-paket'): string {
  const ids = new Set(existing.map((p) => p.id));
  let id = base.replace(/[^a-z0-9-]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') || 'yeni-paket';
  let n = 1;
  while (ids.has(id)) {
    id = `${base}-${++n}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  }
  return id;
}

export function addPlanToTableSections(
  sections: PricingTableSection[],
  planId: string,
  defaultCell: TableCell = '—',
): PricingTableSection[] {
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      ...row,
      values: { ...row.values, [planId]: defaultCell },
    })),
  }));
}

export function removePlanFromTableSections(
  sections: PricingTableSection[],
  planId: string,
): PricingTableSection[] {
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => {
      const values = { ...row.values };
      delete values[planId];
      return { ...row, values };
    }),
  }));
}

export function renamePlanInTableSections(
  sections: PricingTableSection[],
  oldId: string,
  newId: string,
): PricingTableSection[] {
  if (oldId === newId) return sections;
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => {
      const values = { ...row.values };
      if (Object.prototype.hasOwnProperty.call(values, oldId)) {
        values[newId] = values[oldId];
        delete values[oldId];
      }
      return { ...row, values };
    }),
  }));
}

export function mergePricingPagePayload(remote: unknown): PricingPagePayload {
  const d = DEFAULT_PRICING_PAGE_PAYLOAD;
  if (!remote || typeof remote !== 'object') return deepClone(d);
  const o = remote as Partial<PricingPagePayload>;
  if (!Array.isArray(o.plans) || o.plans.length === 0) return deepClone(d);
  const defaultById = new Map(d.plans.map((plan) => [plan.id, plan]));
  const rawPlans = (o.plans as unknown[]).filter(
    (plan): plan is Partial<PricingPlan> =>
      plan != null && typeof plan === 'object' && !Array.isArray(plan),
  );
  if (rawPlans.length === 0) return deepClone(d);
  const mergedPlans = rawPlans.map((plan) => {
    const id = String(plan.id || '').trim();
    const fallback = (id && defaultById.get(id)) || d.plans[0];
    return normalizePricingPlan(plan, fallback);
  });
  return {
    highlightPlanId: typeof o.highlightPlanId === 'string' && o.highlightPlanId ? o.highlightPlanId : d.highlightPlanId,
    plans: mergedPlans,
    tableSections: Array.isArray(o.tableSections) && o.tableSections.length > 0 ? o.tableSections : deepClone(d.tableSections),
    faqItems: Array.isArray(o.faqItems) && o.faqItems.length > 0 ? o.faqItems : deepClone(d.faqItems),
  };
}
