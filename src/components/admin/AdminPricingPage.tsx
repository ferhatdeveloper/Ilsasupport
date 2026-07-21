import { useCallback, useEffect, useState } from 'react';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';
import { Save, Trash2, ChevronUp, ChevronDown, RotateCcw, ImagePlus, Plus } from 'lucide-react';
import { apiFunctionsBase, resolveCmsPublicAssetUrl } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { uploadCmsImage } from './cmsImageUpload';
import { ImageUploadField } from './ImageUploadField';
import {
  DEFAULT_PRICING_PAGE_PAYLOAD,
  addPlanToTableSections,
  createNewPricingPlan,
  mergePricingPagePayload,
  removePlanFromTableSections,
  renamePlanInTableSections,
  uniquePricingPlanId,
  type PricingFaqItem,
  type PricingPagePayload,
  type PricingPlan,
} from '../../data/pricingPageDefaults';

/** defaults dosyasında deepClonePayload export etmedik — burada kısa kopya */
function clonePayload(p: PricingPagePayload): PricingPagePayload {
  return JSON.parse(JSON.stringify(p)) as PricingPagePayload;
}

export function AdminPricingPage() {
  const [payload, setPayload] = useState<PricingPagePayload>(clonePayload(DEFAULT_PRICING_PAGE_PAYLOAD));
  const [tableJson, setTableJson] = useState('');
  const [msg, setMsg] = useState('');
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [saving, setSaving] = useState(false);
  const [uploadingPlanIndex, setUploadingPlanIndex] = useState<number | null>(null);

  const jsonHeaders = { 'Content-Type': 'application/json' };

  const uploadPlanImage = async (planIndex: number, file: File) => {
    setMsg('');
    setUploadingPlanIndex(planIndex);
    try {
      const imageUrl = await uploadCmsImage(file, 'pricing');
      updatePlan(planIndex, { imageUrl });
      setMsg('Görsel yüklendi. Paketi kaydetmeyi unutmayın.');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingPlanIndex(null);
    }
  };

  const load = useCallback(async () => {
    beginLoad();
    setMsg('');
    try {
      const res = await adminFetch(`${apiFunctionsBase}/admin/cms/pricing-page`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Yükleme hatası');
      if (data.loadWarning) {
        const extra = [data.loadWarningDetail, data.loadWarningCode ? `[${data.loadWarningCode}]` : '']
          .filter(Boolean)
          .join(' ');
        setMsg(extra ? `${data.loadWarning} ${extra}` : data.loadWarning);
      }
      const raw =
        data.payload && typeof data.payload === 'object' && Array.isArray(data.payload.plans) && data.payload.plans.length
          ? data.payload
          : null;
      const p = clonePayload(mergePricingPagePayload(raw));
      setPayload(p);
      setTableJson(JSON.stringify(p.tableSections, null, 2));
    } catch (e: any) {
      setMsg(e?.message || String(e));
      const p = clonePayload(DEFAULT_PRICING_PAGE_PAYLOAD);
      setPayload(p);
      setTableJson(JSON.stringify(p.tableSections, null, 2));
    } finally {
      endLoad();
    }
  }, [beginLoad, endLoad]);

  useEffect(() => {
    load();
  }, [load]);

  const updatePlan = (index: number, patch: Partial<PricingPlan>) => {
    setPayload((prev) => {
      const next = clonePayload(prev);
      next.plans[index] = { ...next.plans[index], ...patch };
      return next;
    });
  };

  const movePlan = (index: number, dir: -1 | 1) => {
    setPayload((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.plans.length) return prev;
      const next = clonePayload(prev);
      const t = next.plans[index];
      next.plans[index] = next.plans[j];
      next.plans[j] = t;
      return next;
    });
  };

  const syncTableJson = (sections: PricingPagePayload['tableSections']) => {
    setTableJson(JSON.stringify(sections, null, 2));
  };

  const addPlan = () => {
    const next = clonePayload(payload);
    const id = uniquePricingPlanId(next.plans);
    next.plans.push(createNewPricingPlan(id));
    next.tableSections = addPlanToTableSections(next.tableSections, id);
    setPayload(next);
    syncTableJson(next.tableSections);
    setMsg('Yeni paket eklendi. Ad, kod ve görseli düzenleyip Kaydet’e basın.');
  };

  const updatePlanId = (index: number, raw: string) => {
    const slug = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) {
      setMsg('Paket kodu yalnızca harf, rakam ve tire içerebilir.');
      return;
    }
    const oldId = payload.plans[index]?.id;
    if (!oldId || oldId === slug) return;
    if (payload.plans.some((p, i) => i !== index && p.id === slug)) {
      setMsg('Bu paket kodu zaten kullanılıyor.');
      return;
    }
    const next = clonePayload(payload);
    next.plans[index] = { ...next.plans[index], id: slug };
    next.tableSections = renamePlanInTableSections(next.tableSections, oldId, slug);
    if (next.highlightPlanId === oldId) next.highlightPlanId = slug;
    setPayload(next);
    syncTableJson(next.tableSections);
  };

  const removePlan = (index: number) => {
    if (payload.plans.length <= 1) {
      setMsg('En az bir paket kalmalı.');
      return;
    }
    const removedId = payload.plans[index]?.id;
    const next = clonePayload(payload);
    next.plans.splice(index, 1);
    if (removedId) {
      next.tableSections = removePlanFromTableSections(next.tableSections, removedId);
    }
    if (!next.plans.some((p) => p.id === next.highlightPlanId)) {
      next.highlightPlanId = next.plans[0].id;
    }
    setPayload(next);
    syncTableJson(next.tableSections);
  };

  const updateFaq = (i: number, patch: Partial<PricingFaqItem>) => {
    setPayload((prev) => {
      const next = clonePayload(prev);
      next.faqItems[i] = { ...next.faqItems[i], ...patch };
      return next;
    });
  };

  const addFaq = () => {
    setPayload((prev) => {
      const next = clonePayload(prev);
      next.faqItems.push({ q: '', a: '' });
      return next;
    });
  };

  const removeFaq = (i: number) => {
    setPayload((prev) => {
      const next = clonePayload(prev);
      next.faqItems.splice(i, 1);
      if (next.faqItems.length === 0) next.faqItems.push({ q: '', a: '' });
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      let tableSections;
      try {
        tableSections = JSON.parse(tableJson);
      } catch {
        throw new Error('Karşılaştırma tablosu JSON geçersiz');
      }
      if (!Array.isArray(tableSections)) throw new Error('tableSections bir dizi olmalı');
      const body: PricingPagePayload = { ...payload, tableSections };
      const res = await adminFetch(`${apiFunctionsBase}/admin/cms/pricing-page`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ payload: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kayıt hatası');
      setMsg('Kaydedildi.');
      /** Sunucu JSON’u hemen aynı gövdeyle senkronla (GET önbelleği / birleştirme gecikmesinde görsel kaybolmasın) */
      setPayload(clonePayload(mergePricingPagePayload(body)));
      setTableJson(JSON.stringify(body.tableSections, null, 2));
      await load();
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    const p = clonePayload(DEFAULT_PRICING_PAGE_PAYLOAD);
    setPayload(p);
    setTableJson(JSON.stringify(p.tableSections, null, 2));
    setMsg('Form varsayılanlara döndü (henüz kaydedilmedi).');
  };

  if (loading) {
    return <div className="p-8 text-gray-300">Paket verisi yükleniyor…</div>;
  }

  return (
    <div className="p-6 max-w-6xl text-white">
      <h1 className="text-2xl font-bold mb-2">Paket fiyatları (CMS)</h1>
      <p className="text-gray-400 text-sm mb-6">
        Paket ekleyebilir, silebilir, sırasını değiştirebilir ve her paket için <strong className="text-gray-200">görsel</strong>{' '}
        yükleyebilirsiniz. Ana sayfadaki paket sırası buradaki sırayla aynıdır. Karşılaştırma tablosu yeni paket
        eklendiğinde otomatik sütun açar; detay için &quot;Tablo, vurgu ve SSS&quot; bölümünü kullanın.
      </p>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-sm">
          {msg}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-8">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={addPlan}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 rounded-lg hover:bg-emerald-600"
        >
          <Plus className="w-4 h-4" />
          Paket ekle
        </button>
        <button
          type="button"
          onClick={resetDefaults}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
        >
          <RotateCcw className="w-4 h-4" />
          Varsayılanları yükle
        </button>
      </div>

      <div className="space-y-4 max-w-2xl">
        {payload.plans.map((plan, pi) => (
          <div key={`${plan.id}-${pi}`} className="border border-gray-700 rounded-xl p-4 bg-gray-800/50">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-[200px] space-y-2">
                <div className="text-xs text-gray-500">
                  Sıra {pi + 1} / {payload.plans.length}
                </div>
                <label className="block text-xs text-gray-400">
                  Paket adı
                  <input
                    type="text"
                    value={plan.name}
                    onChange={(e) => updatePlan(pi, { name: e.target.value })}
                    className="mt-0.5 w-full bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  Paket kodu (id)
                  <input
                    type="text"
                    defaultValue={plan.id}
                    key={`id-${plan.id}-${pi}`}
                    onBlur={(e) => updatePlanId(pi, e.target.value)}
                    className="mt-0.5 w-full bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-sm font-mono text-gray-200"
                    placeholder="ornek-paket"
                  />
                </label>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" className="p-2 bg-gray-700 rounded hover:bg-gray-600" onClick={() => movePlan(pi, -1)} title="Yukarı taşı">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button type="button" className="p-2 bg-gray-700 rounded hover:bg-gray-600" onClick={() => movePlan(pi, 1)} title="Aşağı taşı">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="p-2 bg-red-900/50 rounded text-red-300 hover:bg-red-900/70"
                  onClick={() => removePlan(pi)}
                  title="Paketi listeden kaldır (kaydedince kalıcı)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-600 bg-gray-900/40 p-3">
              <div className="text-xs text-gray-400 mb-2 flex items-center gap-2">
                <ImagePlus className="w-3.5 h-3.5" />
                Paket görseli
              </div>
              {plan.imageUrl ? (
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <img
                    src={resolveCmsPublicAssetUrl(plan.imageUrl)}
                    alt=""
                    className="max-h-40 max-w-full rounded-md border border-gray-600 object-contain bg-black/30"
                  />
                  <button type="button" className="text-xs text-red-400 hover:underline" onClick={() => updatePlan(pi, { imageUrl: null })}>
                    Görseli kaldır
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-2">Henüz görsel yok — dosya seçin veya Kaydet öncesi yükleyin.</p>
              )}
              <ImageUploadField
                target="pricing"
                directUpload
                disabled={uploadingPlanIndex === pi}
                uploading={uploadingPlanIndex === pi}
                onFileReady={(f) => uploadPlanImage(pi, f)}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addPlan}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-gray-600 rounded-xl text-sm text-gray-300 hover:bg-gray-800/50 hover:border-emerald-600 hover:text-emerald-400"
        >
          <Plus className="w-4 h-4" />
          Yeni paket ekle
        </button>
      </div>

      <details className="mt-10 rounded-lg border border-gray-700 bg-gray-900/30 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-200 select-none">
          Tablo, vurgu ve SSS (ileri seviye)
        </summary>
        <p className="text-xs text-gray-500 mt-2 mb-4">
          Karşılaştırma tablosu JSON’u, tabloda vurgulu sütun ve SSS burada düzenlenir; paket kartı metinleri bu formda yoktur.
        </p>
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Tabloda vurgulanacak paket (sütun)</label>
          <select
            value={payload.highlightPlanId}
            onChange={(e) => setPayload((p) => ({ ...clonePayload(p), highlightPlanId: e.target.value }))}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 w-full max-w-md"
          >
            {payload.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>
        <h2 className="text-lg font-bold mb-2">Sık sorulan sorular</h2>
        {payload.faqItems.map((faq, i) => (
          <div key={i} className="border border-gray-700 rounded-lg p-3 mb-3 bg-gray-800/40">
            <input
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm mb-2"
              placeholder="Soru"
              value={faq.q}
              onChange={(e) => updateFaq(i, { q: e.target.value })}
            />
            <textarea
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm min-h-[70px]"
              placeholder="Cevap"
              value={faq.a}
              onChange={(e) => updateFaq(i, { a: e.target.value })}
            />
            <button type="button" className="text-xs text-red-400 mt-1" onClick={() => removeFaq(i)}>
              Kaldır
            </button>
          </div>
        ))}
        <button type="button" className="text-sm text-purple-400 hover:underline mb-6" onClick={addFaq}>
          + SSS ekle
        </button>
        <h2 className="text-lg font-bold mb-2">Karşılaştırma tablosu (JSON)</h2>
        <textarea
          className="w-full min-h-[240px] bg-gray-900 border border-gray-600 rounded-lg p-3 font-mono text-xs"
          value={tableJson}
          onChange={(e) => setTableJson(e.target.value)}
        />
      </details>
    </div>
  );
}
