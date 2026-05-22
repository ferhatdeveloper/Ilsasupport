import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Upload,
  FileText,
  Trash2,
  Edit,
  Search,
  Link as LinkIcon,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  Save,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase } from '../../utils/supabase/info';
import { adminFetch } from '../../utils/adminApi';
import { useTheme } from '../../contexts/ThemeContext';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';
import { BilgiCategoryPicker } from './BilgiCategoryPicker';
import {
  type CategoryRow,
  bilgiCategoryLabels,
  bilgiFieldsFromSelection,
  resolveSelectionFromBilgi,
  toCategoryRow,
  validateCategorySelection,
} from './categoryTreeUtils';

async function readApiErrorMessage(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { error?: string; detail?: string };
    return [j.error, j.detail].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
  } catch {
    return t.slice(0, 240) || `HTTP ${res.status}`;
  }
}

interface AdminBilgiFile {
  id: string;
  name: string;
  downloadUrl: string;
  categoryId: string;
  categoryName: string;
  mainCategoryName?: string;
  subCategoryName?: string;
  listCategoryName?: string;
  downloadCount: number;
  size?: number;
  altkat?: string;
  boyutRaw?: string;
  createdAt: string;
}

function enrichFileRow(file: AdminBilgiFile, categoryRows: CategoryRow[]): AdminBilgiFile {
  if (file.mainCategoryName && file.subCategoryName) return file;
  const labels = bilgiCategoryLabels(categoryRows, file.categoryId, file.altkat ?? '');
  return {
    ...file,
    mainCategoryName: file.mainCategoryName ?? labels.mainCategoryName,
    subCategoryName: file.subCategoryName ?? labels.subCategoryName,
    listCategoryName: file.listCategoryName ?? labels.listCategoryName,
    categoryName: file.categoryName || labels.listCategoryName,
  };
}

function formatBilgiDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

interface Category {
  id: string;
  name: string;
  listLabel: string;
}

export type BilgiFormData = {
  name: string;
  downloadUrl: string;
  categoryId: string;
  altkat: string;
  boyut: string;
};

function categoriesWithNumericIds(categories: Category[]): Category[] {
  return categories.filter((c) => /^[0-9]+$/.test(String(c.id)));
}

const EMPTY_FORM: BilgiFormData = {
  name: '',
  downloadUrl: '',
  categoryId: '',
  altkat: '',
  boyut: '',
};

function fileToForm(file: AdminBilgiFile): BilgiFormData {
  return {
    name: file.name,
    downloadUrl: file.downloadUrl,
    categoryId: file.categoryId,
    altkat: file.altkat ?? '',
    boyut: file.boyutRaw ?? '',
  };
}

const FILES_FETCH_MS = 120_000;

type ListStats = { total: number; downloads: number };
type PanelMode = 'idle' | 'create' | 'edit';

export function AdminFilesPage(_props: AdminFilesPageProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const statCardClass = isDark
    ? 'rounded-xl border border-gray-700 bg-gray-800/50 p-4 backdrop-blur'
    : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
  const statLabelClass = isDark ? 'mb-1 text-sm text-slate-400' : 'mb-1 text-sm text-slate-500';
  const statValueClass = isDark ? 'text-2xl font-semibold text-slate-50' : 'text-2xl font-semibold text-slate-900';

  const inputClass = isDark
    ? 'w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-600 focus:border-transparent'
    : 'w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600 focus:border-transparent';

  const filterSelectClass = isDark
    ? 'px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-600 focus:border-transparent min-w-[200px]'
    : 'px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600 focus:border-transparent min-w-[200px]';

  const errorBannerClass = isDark
    ? 'mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-red-200 text-sm flex flex-wrap items-center justify-between gap-2'
    : 'mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm flex flex-wrap items-center justify-between gap-2';

  const tableWrapClass = isDark
    ? 'bg-gray-800 border border-gray-700 rounded-lg overflow-hidden'
    : 'bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm';
  const theadClass = isDark ? 'bg-gray-900' : 'bg-slate-100';
  const thClass = isDark
    ? 'px-4 py-3 text-left text-xs text-gray-400 uppercase tracking-wider'
    : 'px-4 py-3 text-left text-xs text-slate-600 uppercase tracking-wider';
  const tbodyDivideClass = isDark ? 'divide-y divide-gray-700' : 'divide-y divide-slate-200';
  const trHoverClass = isDark ? 'hover:bg-gray-800/80 cursor-pointer' : 'hover:bg-slate-50 cursor-pointer';
  const trSelectedClass = isDark ? 'bg-purple-950/40 ring-1 ring-inset ring-purple-600/50' : 'bg-purple-50 ring-1 ring-inset ring-purple-300';

  const paginationFooterClass = isDark
    ? 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-4 py-4 border-t border-gray-700 bg-gray-900/50'
    : 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-4 py-4 border-t border-slate-200 bg-slate-50';

  const pageSizeSelectClass = isDark
    ? 'bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm'
    : 'bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-900 text-sm';
  const thClassRight = isDark
    ? 'px-4 py-3 text-right text-xs text-gray-400 uppercase tracking-wider'
    : 'px-4 py-3 text-right text-xs text-slate-600 uppercase tracking-wider';

  const pageRangeTextClass = isDark ? 'text-gray-300' : 'text-slate-800';
  const pageMetaTextClass = isDark ? 'text-sm text-gray-400' : 'text-sm text-slate-600';
  const pageInfoMutedClass = isDark ? 'text-xs text-gray-500' : 'text-xs text-slate-500';
  const pageCounterClass = isDark ? 'text-sm text-gray-300 px-2' : 'text-sm text-slate-800 px-2';
  const pageNavBtnClass = isDark
    ? 'inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none'
    : 'inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded border border-slate-200 text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none';

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<ListStats>({ total: 0, downloads: 0 });
  const [files, setFiles] = useState<AdminBilgiFile[]>([]);

  const [panelMode, setPanelMode] = useState<PanelMode>('idle');
  const [selectedFile, setSelectedFile] = useState<AdminBilgiFile | null>(null);
  const [formData, setFormData] = useState<BilgiFormData>(EMPTY_FORM);
  /** Kategori seçicilerinin iç durumunu sıfırlamak için (kayıt sonrası temiz form) */
  const [formSessionKey, setFormSessionKey] = useState(0);
  const [formDirty, setFormDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorPanelRef = useRef<HTMLDivElement>(null);

  const numericCategories = categoriesWithNumericIds(categories);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterCategory]);

  const loadCategories = useCallback(async () => {
    try {
      const response = await adminFetch(`${apiFunctionsBase}/admin/categories`);
      if (!response.ok) {
        setCategories([]);
        setCategoryRows([]);
        return;
      }
      const data = await response.json();
      const raw = (data.categories || []) as Array<{
        id: number;
        name: string;
        level?: number;
        parentId?: number | null;
      }>;
      const sorted = [...raw].sort((a, b) => {
        const la = a.level ?? 1;
        const lb = b.level ?? 1;
        if (la !== lb) return la - lb;
        return String(a.name).localeCompare(String(b.name), 'tr');
      });
      const rows: CategoryRow[] = raw.map((c) => toCategoryRow(c));
      setCategoryRows(rows);
      setCategories(
        sorted.map((c) => {
          const level = c.level ?? 1;
          const prefix = level > 1 ? `${'  '.repeat(level - 1)}↳ ` : '';
          return {
            id: String(c.id),
            name: String(c.name || ''),
            listLabel: `${prefix}${c.name || ''}`,
          };
        }),
      );
    } catch {
      setCategories([]);
      setCategoryRows([]);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const filesFetchGen = useRef(0);

  const loadFiles = useCallback(async () => {
    const gen = ++filesFetchGen.current;
    setLoadError(null);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FILES_FETCH_MS);
    try {
      beginLoad();
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterCategory !== 'all') params.set('categoryId', filterCategory);

      const response = await adminFetch(`${apiFunctionsBase}/admin/files?${params}`, {
        signal: ac.signal,
      });

      if (gen !== filesFetchGen.current) return;

      if (response.ok) {
        const data = await response.json();
        const list = data.files || [];
        const tot = Number(data.total) || 0;
        const totalPagesFromApi = Math.max(1, Number(data.totalPages) || 1);
        if (list.length === 0 && page > 1 && tot > 0) {
          setPage((p) => Math.max(1, Math.min(p - 1, totalPagesFromApi)));
          return;
        }
        setFiles(list);
        setTotalCount(tot);
        setTotalPages(totalPagesFromApi);
        if (data.stats) {
          setStats({
            total: Number(data.stats.total) || 0,
            downloads: Number(data.stats.downloads) || 0,
          });
        }
      } else {
        setLoadError(await readApiErrorMessage(response).catch(() => `HTTP ${response.status}`));
        setFiles([]);
      }
    } catch (error: unknown) {
      if (gen !== filesFetchGen.current) return;
      const name = error instanceof Error ? error.name : '';
      setLoadError(
        name === 'AbortError'
          ? 'İstek zaman aşımına uğradı. API veya veritabanını kontrol edin.'
          : 'Dosya listesi alınamadı (ağ veya sunucu).',
      );
      setFiles([]);
    } finally {
      if (gen === filesFetchGen.current) {
        clearTimeout(timer);
        endLoad();
      }
    }
  }, [page, pageSize, filterCategory, debouncedSearch]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const scrollToEditor = () => {
    requestAnimationFrame(() => {
      editorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openCreate = () => {
    let initial = { ...EMPTY_FORM };
    if (filterCategory !== 'all' && /^[0-9]+$/.test(filterCategory)) {
      const sel = resolveSelectionFromBilgi(categoryRows, filterCategory, filterCategory);
      initial = { ...EMPTY_FORM, ...bilgiFieldsFromSelection(sel.mainId, sel.subId, sel.leafId) };
    }
    setPanelMode('create');
    setSelectedFile(null);
    setFormData(initial);
    setFormDirty(false);
    scrollToEditor();
  };

  const openEdit = (file: AdminBilgiFile) => {
    setPanelMode('edit');
    setSelectedFile(file);
    setFormData(fileToForm(file));
    setFormDirty(false);
    scrollToEditor();
  };

  const closePanel = () => {
    if (formDirty && !confirm('Kaydedilmemiş değişiklikler var. Paneli kapatmak istiyor musunuz?')) return;
    setPanelMode('idle');
    setSelectedFile(null);
    setFormData(EMPTY_FORM);
    setFormDirty(false);
  };

  const patchForm = (patch: Partial<BilgiFormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
    setFormDirty(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.downloadUrl.trim()) {
      toast.error('Dosya adı ve Drive linki zorunludur');
      return;
    }
    const sel = resolveSelectionFromBilgi(categoryRows, formData.categoryId, formData.altkat);
    const catErr = validateCategorySelection(categoryRows, sel.mainId, sel.subId, sel.leafId);
    if (catErr) {
      toast.error(catErr);
      return;
    }

    setSaving(true);
    try {
      const isCreate = panelMode === 'create';
      const url = isCreate
        ? `${apiFunctionsBase}/admin/files/create`
        : `${apiFunctionsBase}/admin/files/${selectedFile!.id}`;
      const response = await adminFetch(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          downloadUrl: formData.downloadUrl,
          categoryId: formData.categoryId,
          altkat: formData.altkat,
          boyut: formData.boyut,
        }),
      });

      await response.json().catch(() => ({}));

      if (response.ok) {
        toast.success(
          isCreate ? 'Bilgi kaydı eklendi — form temizlendi, yeni kayıt ekleyebilirsiniz' : 'Kayıt güncellendi',
        );
        setFormDirty(false);
        await loadFiles();
        if (isCreate) {
          setPanelMode('create');
          setSelectedFile(null);
          setFormData({ ...EMPTY_FORM });
          setFormSessionKey((k) => k + 1);
          scrollToEditor();
        } else if (selectedFile) {
          const updated: AdminBilgiFile = {
            ...selectedFile,
            name: formData.name,
            downloadUrl: formData.downloadUrl,
            categoryId: formData.categoryId,
            categoryName: categories.find((c) => c.id === formData.categoryId)?.name ?? selectedFile.categoryName,
            altkat: formData.altkat,
            boyutRaw: formData.boyut,
          };
          setSelectedFile(updated);
          setFormData(fileToForm(updated));
        }
      } else {
        toast.error(await readApiErrorMessage(response));
      }
    } catch {
      toast.error('Kayıt kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const resetPanel = () => {
    setPanelMode('idle');
    setSelectedFile(null);
    setFormData(EMPTY_FORM);
    setFormDirty(false);
  };

  const deleteFile = async (fileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return;

    try {
      const response = await adminFetch(`${apiFunctionsBase}/admin/files/${fileId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        toast.success('Kayıt silindi');
        if (selectedFile?.id === fileId) resetPanel();
        void loadFiles();
      } else {
        toast.error(await readApiErrorMessage(response));
      }
    } catch {
      toast.error('Silme başarısız');
    }
  };

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
  const panelOpen = panelMode !== 'idle';

  const displayFiles = useMemo(
    () => files.map((f) => enrichFileRow(f, categoryRows)),
    [files, categoryRows],
  );

  const listToolbarInputClass = isDark
    ? 'w-full min-w-[180px] flex-1 pl-9 pr-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:ring-2 focus:ring-purple-600'
    : 'w-full min-w-[180px] flex-1 pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-600';

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 lg:p-6 overflow-auto">
      <header className={`mb-4 shrink-0 ${panelOpen ? 'hidden lg:block' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h1 className={isDark ? 'text-2xl font-semibold text-slate-50' : 'text-2xl font-semibold text-slate-900'}>
              Bilgi (dosya) yönetimi
            </h1>
            <p className={`mt-1 text-sm max-w-2xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <strong>Yeni bilgi</strong> ile ekleme; listede <strong>son eklenenler üstte</strong>. Arama dosya adı ve
              kategori adında çalışır.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              panelMode === 'create'
                ? 'bg-purple-700 text-white ring-2 ring-purple-400'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            <Upload className="w-5 h-5" />
            Yeni bilgi
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDark ? 'text-gray-400' : 'text-slate-400'}`}
            />
            <input
              type="text"
              placeholder="Dosya adı ara (~400ms)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={inputClass}
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={filterSelectClass}
          >
            <option value="all">Tüm kategoriler</option>
            {numericCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.listLabel}
              </option>
            ))}
          </select>
        </div>

        {loadError && (
          <div className={errorBannerClass}>
            <span>{loadError}</span>
            <button type="button" onClick={() => void loadFiles()} className="text-xs underline">
              Yeniden dene
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['Toplam kayıt', stats.total],
              ['Toplam indirme', stats.downloads],
            ] as const
          ).map(([label, val]) => (
            <div key={label} className={statCardClass}>
              <div className={statLabelClass}>{label}</div>
              <div className={statValueClass}>{val}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-[min(640px,75vh)] lg:min-h-[calc(100vh-14rem)] gap-4 flex-col lg:flex-row">
        {panelOpen && (
          <div
            ref={editorPanelRef}
            className="flex flex-col flex-1 min-h-0 min-w-0 order-1 lg:order-2 lg:max-w-xl lg:flex-[0.95]"
          >
            <button
              type="button"
              onClick={closePanel}
              className={`lg:hidden mb-3 inline-flex items-center gap-2 text-sm font-medium ${
                isDark ? 'text-purple-300 hover:text-purple-200' : 'text-purple-700 hover:text-purple-800'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              Listeye dön
            </button>
            <BilgiEditorPanel
              key={formSessionKey}
              mode={panelMode === 'create' ? 'create' : 'edit'}
              file={selectedFile}
              formData={formData}
              categoryRows={categoryRows}
              saving={saving}
              formDirty={formDirty}
              isDark={isDark}
              onClose={closePanel}
              onChange={patchForm}
              onSave={() => void handleSave()}
              onDelete={selectedFile ? () => void deleteFile(selectedFile.id) : undefined}
              layout="page"
            />
          </div>
        )}

        <section
          className={`min-w-0 flex flex-col flex-1 order-2 lg:order-1 ${
            panelOpen ? 'hidden lg:flex lg:flex-[1.1]' : 'flex'
          }`}
        >
          {loading ? (
            <p className={isDark ? 'text-slate-400 py-8 text-center' : 'text-slate-500 py-8 text-center'}>Yükleniyor…</p>
          ) : (
            <div className={`${tableWrapClass} flex flex-col min-h-0 flex-1`}>
              <div
                className={`shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b ${
                  isDark ? 'border-gray-700 bg-gray-900/60' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search
                    className={`absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}
                  />
                  <input
                    type="search"
                    placeholder="Dosya veya kategori ara…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={listToolbarInputClass}
                    aria-label="Dosya ara"
                  />
                </div>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className={`${filterSelectClass} min-w-[160px] py-2 text-sm`}
                >
                  <option value="all">Tüm kategoriler</option>
                  {numericCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.listLabel}
                    </option>
                  ))}
                </select>
                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>En yeni üstte</span>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <thead className={`${theadClass} sticky top-0 z-10`}>
                    <tr>
                      <th className={thClass}>Bilgi adı</th>
                      <th className={`${thClass} hidden sm:table-cell`}>Ana klasör</th>
                      <th className={`${thClass} hidden md:table-cell`}>Alt kategori</th>
                      <th className={`${thClass} hidden xl:table-cell`}>Eklenme</th>
                      <th className={`${thClass} hidden lg:table-cell`}>İndirme</th>
                      <th className={thClassRight}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody className={tbodyDivideClass}>
                    {displayFiles.map((file) => {
                      const selected = selectedFile?.id === file.id && panelMode === 'edit';
                      return (
                        <tr
                          key={file.id}
                          className={`${trHoverClass} ${selected ? trSelectedClass : ''}`}
                          onClick={() => openEdit(file)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                              <span className={`truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{file.name}</span>
                            </div>
                          </td>
                          <td
                            className={`px-4 py-3 hidden sm:table-cell ${isDark ? 'text-gray-300' : 'text-slate-700'}`}
                          >
                            <span className="line-clamp-2 text-xs font-medium">
                              {file.mainCategoryName ?? '—'}
                            </span>
                          </td>
                          <td className={`px-4 py-3 hidden md:table-cell ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
                            <span className="line-clamp-2 text-xs">{file.subCategoryName ?? '—'}</span>
                          </td>
                          <td
                            className={`px-4 py-3 hidden xl:table-cell whitespace-nowrap text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}
                          >
                            {formatBilgiDate(file.createdAt)}
                          </td>
                          <td className={`px-4 py-3 hidden lg:table-cell text-purple-400`}>{file.downloadCount}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <a
                                href={file.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={
                                  isDark
                                    ? 'p-1.5 text-blue-400 hover:bg-gray-700 rounded'
                                    : 'p-1.5 text-blue-600 hover:bg-slate-100 rounded'
                                }
                                title="Drive"
                              >
                                <LinkIcon className="w-4 h-4" />
                              </a>
                              <button
                                type="button"
                                onClick={() => openEdit(file)}
                                className={
                                  isDark
                                    ? 'p-1.5 text-amber-400 hover:bg-gray-700 rounded'
                                    : 'p-1.5 text-amber-600 hover:bg-slate-100 rounded'
                                }
                                title="Düzenle"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => void deleteFile(file.id, e)}
                                className={
                                  isDark
                                    ? 'p-1.5 text-red-400 hover:bg-gray-700 rounded'
                                    : 'p-1.5 text-red-600 hover:bg-slate-100 rounded'
                                }
                                title="Sil"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {displayFiles.length === 0 && (
                  <p className={isDark ? 'py-12 text-center text-slate-400' : 'py-12 text-center text-slate-500'}>
                    Bu sayfada kayıt yok — sağdan <strong>Yeni bilgi</strong> ile ekleyin.
                  </p>
                )}
              </div>

              {totalCount > 0 && (
                <div className={paginationFooterClass}>
                  <div className={pageMetaTextClass}>
                    <span className={pageRangeTextClass}>
                      {rangeStart}–{rangeEnd}
                    </span>
                    <span className="mx-1">/</span>
                    <span>{totalCount}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    <label className={`${pageInfoMutedClass} flex items-center gap-2`}>
                      Sayfa
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setPage(1);
                        }}
                        className={pageSizeSelectClass}
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </label>
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={pageNavBtnClass}>
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className={pageCounterClass}>
                      {page}/{totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className={pageNavBtnClass}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {!panelOpen && (
          <aside
            className={
              isDark
                ? 'hidden xl:flex flex-col flex-[0.9] min-w-[280px] rounded-xl border border-dashed border-gray-600 bg-gray-900/30 items-center justify-center p-8 text-center'
                : 'hidden xl:flex flex-col flex-[0.9] min-w-[280px] rounded-xl border border-dashed border-slate-300 bg-slate-50 items-center justify-center p-8 text-center'
            }
          >
            <FileText className={`w-12 h-12 mb-3 ${isDark ? 'text-gray-600' : 'text-slate-300'}`} />
            <p className={isDark ? 'text-gray-400 text-sm' : 'text-slate-600 text-sm'}>
              Tablodan bir satıra tıklayın veya <strong>Yeni bilgi</strong> ile kayıt oluşturun.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

function BilgiEditorPanel({
  mode,
  file,
  formData,
  categoryRows,
  saving,
  formDirty,
  isDark,
  onClose,
  onChange,
  onSave,
  onDelete,
  layout = 'sidebar',
}: {
  mode: 'create' | 'edit';
  file: AdminBilgiFile | null;
  formData: BilgiFormData;
  categoryRows: CategoryRow[];
  saving: boolean;
  formDirty: boolean;
  isDark: boolean;
  onClose: () => void;
  onChange: (patch: Partial<BilgiFormData>) => void;
  onSave: () => void;
  onDelete?: () => void;
  layout?: 'sidebar' | 'page';
}) {
  const isPage = layout === 'page';
  const panelClass = isDark
    ? `flex flex-col flex-1 min-h-0 rounded-xl border border-gray-700 bg-gray-800/95 shadow-xl ${
        isPage ? '' : 'lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]'
      }`
    : `flex flex-col flex-1 min-h-0 rounded-xl border border-slate-200 bg-white shadow-lg ${
        isPage ? '' : 'lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]'
      }`;
  const labelClass = isDark ? 'block text-xs font-medium text-gray-400 mb-1' : 'block text-xs font-medium text-slate-600 mb-1';
  const fieldClass = isDark
    ? 'w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-600'
    : 'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-purple-600';
  const sectionTitle = isDark ? 'text-sm font-semibold text-slate-200 mb-3' : 'text-sm font-semibold text-slate-800 mb-3';
  const hintClass = isDark ? 'text-xs text-gray-500 mt-1' : 'text-xs text-slate-500 mt-1';
  const warningBox = isDark
    ? 'rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200 mb-4'
    : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 mb-4';

  return (
    <aside className={`${panelClass} w-full min-w-0`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0 ${isDark ? 'border-gray-700' : 'border-slate-200'}`}>
        <div>
          <h2 className={isDark ? 'text-xl font-semibold text-white' : 'text-xl font-semibold text-slate-900'}>
            {mode === 'create' ? 'Yeni bilgi ekle' : 'Bilgi kaydını düzenle'}
          </h2>
          {mode === 'create' && (
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
              Drive linki ve kategori seçimini kaydedin.
            </p>
          )}
          {mode === 'edit' && file && (
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
              ID {file.id} · {file.downloadCount} indirme ·{' '}
              {new Date(file.createdAt).toLocaleDateString('tr-TR')}
              {formDirty ? ' · kaydedilmedi' : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className={isDark ? 'p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg' : 'p-2 text-slate-500 hover:bg-slate-100 rounded-lg'}
          title="Listeye dön"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {categoryRows.length === 0 && (
          <p className={warningBox}>
            Önce <strong>Kategoriler</strong> sekmesinden kategori oluşturun.
          </p>
        )}

        <section>
          <h3 className={sectionTitle}>Temel bilgiler</h3>
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Dosya adı *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className={fieldClass}
                placeholder="örn. Samsung A51 Firmware"
              />
            </div>
            <div>
              <label className={labelClass}>Google Drive linki *</label>
              <input
                type="url"
                value={formData.downloadUrl}
                onChange={(e) => onChange({ downloadUrl: e.target.value })}
                className={fieldClass}
                placeholder="https://drive.google.com/file/d/..."
              />
              {formData.downloadUrl.trim() && (
                <a
                  href={formData.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 mt-2 text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'}`}
                >
                  <ExternalLink className="w-3 h-3" />
                  Bağlantıyı test et
                </a>
              )}
            </div>
          </div>
        </section>

        <section>
          <h3 className={sectionTitle}>Kategori</h3>
          <BilgiCategoryPicker
            rows={categoryRows}
            categoryId={formData.categoryId}
            altkat={formData.altkat}
            disabled={categoryRows.length === 0}
            isDark={isDark}
            onChange={(patch) => onChange(patch)}
            labelClass={labelClass}
            fieldClass={fieldClass}
            hintClass={hintClass}
          />
          <div className="mt-3">
            <label className={labelClass}>Boyut (metin, opsiyonel)</label>
            <input
              type="text"
              value={formData.boyut}
              onChange={(e) => onChange({ boyut: e.target.value })}
              className={fieldClass}
              placeholder="örn. 125000000"
            />
          </div>
        </section>

      </div>

      <div className={`shrink-0 px-4 py-3 border-t flex flex-wrap gap-2 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-slate-200 bg-slate-50'}`}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || categoryRows.length === 0}
          className="inline-flex items-center gap-2 flex-1 min-w-[140px] justify-center py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Kaydediliyor…' : mode === 'create' ? 'Kaydet' : 'Kaydet'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={
            isDark
              ? 'px-4 py-2.5 text-sm rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700'
              : 'px-4 py-2.5 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100'
          }
        >
          Kapat
        </button>
        {mode === 'edit' && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-4 py-2.5 text-sm text-red-500 hover:bg-red-950/30 rounded-lg border border-red-800/50"
          >
            <Trash2 className="w-4 h-4" />
            Sil
          </button>
        )}
      </div>
    </aside>
  );
}
