import { useState, useEffect, useMemo } from 'react';
import { FolderPlus, Trash2, Edit, ChevronRight, FileText, Home, Folder, Search, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { apiFunctionsBase, resolveCmsPublicAssetUrl } from '../../utils/supabase/info';
import { uploadCategoryImage } from './categoryImageUpload';
import { ImageUploadField } from './ImageUploadField';
import { adminFetch } from '../../utils/adminApi';
import { readResponseJson } from '../../utils/readResponseJson';
import { useTheme } from '../../contexts/ThemeContext';
import { useAdminPageLoad } from '../../hooks/useAdminPageLoad';

interface Category {
  id: number;
  name: string;
  parentId: number | null;
  level: number;
  fileCount: number;
  children?: Category[];
  description?: string;
  status?: string;
  order?: number;
  image?: string;
}

function findCategoryById(cats: Category[], id: number | null): Category | null {
  if (id == null) return null;
  for (const cat of cats) {
    if (cat.id === id) return cat;
    if (cat.children?.length) {
      const found = findCategoryById(cat.children, id);
      if (found) return found;
    }
  }
  return null;
}

function collectDescendantIds(cat: Category): Set<number> {
  const s = new Set<number>();
  const walk = (c: Category) => {
    s.add(c.id);
    c.children?.forEach(walk);
  };
  walk(cat);
  return s;
}

function flattenCategories(cats: Category[]): Category[] {
  const out: Category[] = [];
  const walk = (arr: Category[]) => {
    for (const c of arr) {
      out.push(c);
      if (c.children?.length) walk(c.children);
    }
  };
  walk(cats);
  return out;
}

function getCategoryPath(cats: Category[], targetId: number): Category[] {
  const path: Category[] = [];
  const find = (arr: Category[], trail: Category[]): boolean => {
    for (const c of arr) {
      const next = [...trail, c];
      if (c.id === targetId) {
        path.push(...next);
        return true;
      }
      if (c.children?.length && find(c.children, next)) return true;
    }
    return false;
  };
  find(cats, []);
  return path;
}

function categoryMatchesSearch(cat: Category, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return true;
  const name = cat.name.toLocaleLowerCase('tr');
  const desc = (cat.description ?? '').toLocaleLowerCase('tr');
  return name.includes(q) || desc.includes(q) || String(cat.id).includes(q);
}

export function AdminCategoriesPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [categories, setCategories] = useState<Category[]>([]);
  const { loading, beginLoad, endLoad } = useAdminPageLoad();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  
  // Navigation state - breadcrumb için
  const [navigationPath, setNavigationPath] = useState<Category[]>([]);
  const [currentCategories, setCurrentCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    // Navigation path'e göre kategorileri göster
    if (navigationPath.length === 0) {
      // Root level - en üst kategoriler
      setCurrentCategories(categories);
    } else {
      // Alt kategorileri göster
      const lastCategory = navigationPath[navigationPath.length - 1];
      setCurrentCategories(lastCategory.children || []);
    }
  }, [navigationPath, categories]);

  const loadCategories = async () => {
    try {
      beginLoad();

      const response = await adminFetch(`${apiFunctionsBase}/admin/categories`);

      if (response.ok) {
        const data = await response.json();
        const tree = buildCategoryTree(data.categories || []);
        setCategories(tree);
      } else {
        const errorText = await response.text();
        console.error('Failed to load categories:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      endLoad();
    }
  };

  const buildCategoryTree = (flatCategories: Category[]): Category[] => {
    const map = new Map<number, Category>();
    const roots: Category[] = [];

    // İlk pass: Tüm kategorileri map'e ekle
    flatCategories.forEach(cat => {
      map.set(cat.id, { ...cat, children: [] });
    });

    // İkinci pass: Parent-child ilişkilerini kur
    flatCategories.forEach(cat => {
      const category = map.get(cat.id)!;
      if (cat.parentId === null || cat.parentId === undefined) {
        roots.push(category);
      } else {
        const parent = map.get(cat.parentId);
        if (parent) {
          parent.children!.push(category);
        } else {
          // Parent bulunamadı - orphan kategori, sessizce root level'a ekle
          roots.push(category);
          category.parentId = null;
        }
      }
    });

    return roots;
  };

  const deleteCategory = async (categoryId: number) => {
    if (!confirm('Bu kategori ve tüm alt kategoriler silinecek. İlgili bilgi kayıtlarının kategori bağlantısı (katid) kaldırılır. Devam?')) {
      return;
    }

    try {
      const response = await adminFetch(
        `${apiFunctionsBase}/admin/categories/${categoryId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.ok) {
        toast.success('Kategori silindi');
        loadCategories();
      } else {
        const err = await readResponseJson<{ error?: string; detail?: string }>(response);
        toast.error([err.error, err.detail].filter(Boolean).join(' — ') || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Kategori silinemedi');
    }
  };

  const navigateToCategory = (category: Category) => {
    setNavigationPath([...navigationPath, category]);
  };

  const navigateToRoot = () => {
    setNavigationPath([]);
  };

  const navigateToBreadcrumb = (index: number) => {
    setNavigationPath(navigationPath.slice(0, index + 1));
  };

  const getTotalFileCount = (categories: Category[]): number => {
    return categories.reduce((sum, cat) => {
      return sum + cat.fileCount + (cat.children ? getTotalFileCount(cat.children) : 0);
    }, 0);
  };

  const getCategoryCount = (categories: Category[]): number => {
    return categories.reduce((sum, cat) => {
      return sum + 1 + (cat.children ? getCategoryCount(cat.children) : 0);
    }, 0);
  };

  const getCurrentParentId = () => {
    if (navigationPath.length === 0) return null;
    return navigationPath[navigationPath.length - 1].id;
  };

  const getCurrentLevel = () => {
    if (navigationPath.length === 0) return 0;
    return navigationPath[navigationPath.length - 1].level;
  };

  const searchTrim = searchQuery.trim();
  const isSearchMode = searchTrim.length > 0;

  const flatAllCategories = useMemo(() => flattenCategories(categories), [categories]);

  const displayedCategories = useMemo(() => {
    if (!isSearchMode) return currentCategories;
    return flatAllCategories.filter((c) => categoryMatchesSearch(c, searchTrim));
  }, [isSearchMode, searchTrim, currentCategories, flatAllCategories]);

  const openCategoryFromSearch = (category: Category) => {
    const path = getCategoryPath(categories, category.id);
    if (path.length > 1) {
      setNavigationPath(path.slice(0, -1));
    } else {
      setNavigationPath([]);
    }
    setSearchQuery('');
  };

  const statCardClass = isDark
    ? 'rounded-xl border border-gray-700 bg-gray-800/50 p-4 backdrop-blur'
    : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';

  const statLabelClass = isDark ? 'mb-1 text-sm text-slate-400' : 'mb-1 text-sm text-slate-500';
  const statValueClass = isDark ? 'text-2xl font-semibold text-slate-50' : 'text-2xl font-semibold text-slate-900';

  const categoryCardClass = isDark
    ? 'group relative overflow-hidden rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 p-5 transition-all hover:border-purple-500'
    : 'group relative overflow-hidden rounded-xl border border-slate-200 bg-[#ffffff] p-5 shadow-md ring-1 ring-slate-200/80 transition-all hover:border-purple-300 hover:shadow-lg';

  const categoryTitleClass = isDark
    ? 'mb-1 truncate text-lg font-medium text-slate-50'
    : 'mb-1 truncate text-lg font-medium text-slate-900';
  const categoryMetaClass = isDark ? 'flex items-center gap-3 text-sm text-slate-400' : 'flex items-center gap-3 text-sm text-slate-600';

  const folderIconClass = (level: number) => {
    if (isDark) {
      if (level === 1) return 'mt-1 h-8 w-8 shrink-0 text-blue-400';
      if (level === 2) return 'mt-1 h-8 w-8 shrink-0 text-green-400';
      return 'mt-1 h-8 w-8 shrink-0 text-yellow-400';
    }
    if (level === 1) return 'mt-1 h-8 w-8 shrink-0 text-blue-600';
    if (level === 2) return 'mt-1 h-8 w-8 shrink-0 text-green-600';
    return 'mt-1 h-8 w-8 shrink-0 text-amber-600';
  };

  const chevronClass = isDark
    ? 'mt-1 h-5 w-5 shrink-0 text-slate-500 transition-colors group-hover:text-purple-400'
    : 'mt-1 h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-purple-600';

  const searchInputClass = isDark
    ? 'w-full max-w-xl pl-10 pr-10 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder:text-gray-500 focus:ring-2 focus:ring-purple-600 focus:border-transparent'
    : 'w-full max-w-xl pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 shadow-sm focus:ring-2 focus:ring-purple-600 focus:border-transparent';

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className={isDark ? 'mb-2 text-3xl text-slate-50' : 'mb-2 text-3xl text-slate-900'}>
              Kategori Yönetimi
            </h1>
            <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>3 seviyeli hiyerarşik kategori yapısı</p>
          </div>
          {getCurrentLevel() < 3 && (
            <button
              onClick={() => {
                setSelectedParentId(getCurrentParentId());
                setShowCreateModal(true);
              }}
              type="button"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 font-medium text-[#ffffff] shadow-lg transition-all hover:from-purple-700 hover:to-pink-700 hover:shadow-xl"
            >
              <FolderPlus className="h-5 w-5" />
              {navigationPath.length === 0 ? 'Ana Kategori Ekle' : 'Alt Kategori Ekle'}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className={statCardClass}>
            <div className={statLabelClass}>Toplam Kategori</div>
            <div className={statValueClass}>{getCategoryCount(categories)}</div>
          </div>
          <div className={statCardClass}>
            <div className={statLabelClass}>Ana Kategoriler</div>
            <div className={statValueClass}>{categories.filter(c => !c.parentId).length}</div>
          </div>
          <div className={statCardClass}>
            <div className={statLabelClass}>Alt Kategoriler</div>
            <div className={statValueClass}>
              {getCategoryCount(categories) - categories.filter(c => !c.parentId).length}
            </div>
          </div>
          <div className={statCardClass}>
            <div className={statLabelClass}>Toplam Dosya</div>
            <div className={statValueClass}>{getTotalFileCount(categories)}</div>
          </div>
        </div>

        <div className="relative mb-6 max-w-xl">
          <Search
            className={`absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-slate-400'}`}
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kategori ara (ad, açıklama veya id)…"
            className={searchInputClass}
            aria-label="Kategori ara"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 ${
                isDark ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
              title="Aramayı temizle"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {isSearchMode && (
          <p className={`mb-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <strong>{displayedCategories.length}</strong> sonuç — tüm seviyelerde aranıyor. Klasöre gitmek için başlığa
            tıklayın.
          </p>
        )}
      </div>

      {/* Breadcrumb Navigation */}
      {!isSearchMode && navigationPath.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={navigateToRoot}
            className={
              isDark
                ? 'flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-gray-400 transition-all hover:bg-gray-700 hover:text-slate-50'
                : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900'
            }
          >
            <Home className="h-4 w-4" />
            <span>Ana Kategoriler</span>
          </button>

          {navigationPath.map((cat, index) => (
            <div key={cat.id} className="flex items-center gap-2">
              <ChevronRight className={isDark ? 'h-4 w-4 text-slate-500' : 'h-4 w-4 text-slate-400'} />
              <button
                type="button"
                onClick={() => navigateToBreadcrumb(index)}
                className={
                  index === navigationPath.length - 1
                    ? 'rounded-lg bg-purple-600 px-4 py-2 font-medium text-[#ffffff] shadow-sm'
                    : isDark
                      ? 'rounded-lg bg-gray-800 px-4 py-2 text-gray-400 transition-all hover:bg-gray-700 hover:text-slate-50'
                      : 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900'
                }
              >
                {cat.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Category Grid */}
      {loading ? (
        <div className={isDark ? 'py-12 text-center text-slate-400' : 'py-12 text-center text-slate-500'}>
          Yükleniyor...
        </div>
      ) : displayedCategories.length === 0 ? (
        <div className="py-16 text-center">
          <div className="mb-4 text-6xl">{isSearchMode ? '🔍' : '📂'}</div>
          <h3 className={isDark ? 'mb-2 text-xl text-slate-50' : 'mb-2 text-xl text-slate-900'}>
            {isSearchMode
              ? 'Sonuç bulunamadı'
              : navigationPath.length === 0
                ? 'Henüz Kategori Yok'
                : 'Bu Kategoride Alt Kategori Yok'}
          </h3>
          <p className={isDark ? 'mb-6 text-slate-400' : 'mb-6 text-slate-600'}>
            {isSearchMode
              ? `"${searchTrim}" için eşleşen kategori yok.`
              : navigationPath.length === 0
                ? 'Başlamak için yukarıdaki butonu kullanarak ana kategori ekleyin'
                : 'Alt kategori eklemek için yukarıdaki butonu kullanın'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayedCategories.map(category => {
            const hasChildren = category.children && category.children.length > 0;
            const ancestorPath = getCategoryPath(categories, category.id);
            const pathLabel =
              ancestorPath.length > 1 ? ancestorPath.slice(0, -1).map((p) => p.name).join(' › ') : null;

            return (
              <div key={category.id} className={categoryCardClass}>
                <div
                  className={
                    isDark
                      ? 'pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-600/0 via-purple-600/0 to-pink-600/0 transition-all duration-300 group-hover:from-purple-600/5 group-hover:via-purple-600/5 group-hover:to-pink-600/5'
                      : 'pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/0 via-purple-500/0 to-pink-500/0 transition-all duration-300 group-hover:from-purple-500/10 group-hover:via-purple-500/5 group-hover:to-pink-500/10'
                  }
                />

                <div className="relative z-10">
                  {isSearchMode && pathLabel && (
                    <p className={`mb-2 truncate text-xs ${isDark ? 'text-purple-300/90' : 'text-purple-700'}`}>
                      {pathLabel}
                    </p>
                  )}
                  <div
                    className={`mb-4 flex items-start gap-3 ${hasChildren || isSearchMode ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (isSearchMode) openCategoryFromSearch(category);
                      else if (hasChildren) navigateToCategory(category);
                    }}
                  >
                    <Folder className={folderIconClass(category.level)} />
                    <div className="min-w-0 flex-1">
                      <div className={categoryTitleClass}>{category.name}</div>
                      <div className={categoryMetaClass}>
                        <span className="flex items-center gap-1">Level {category.level}</span>
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {category.fileCount}
                        </span>
                      </div>
                    </div>
                    {hasChildren && <ChevronRight className={chevronClass} />}
                  </div>

                  <div className="flex items-center gap-2">
                    {category.level < 3 && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedParentId(category.id);
                          setShowCreateModal(true);
                        }}
                        className={
                          isDark
                            ? 'flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-600/30 bg-green-600/20 px-3 py-2 text-green-400 transition-all hover:bg-green-600/30'
                            : 'flex flex-1 items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-800 transition-all hover:bg-green-100'
                        }
                      >
                        <FolderPlus className="h-4 w-4" />
                        <span className="text-sm font-medium">Ekle</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedCategory(category);
                        setShowEditModal(true);
                      }}
                      className={
                        isDark
                          ? 'flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-600/30 bg-blue-600/20 px-3 py-2 text-blue-400 transition-all hover:bg-blue-600/30'
                          : 'flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800 transition-all hover:bg-blue-100'
                      }
                    >
                      <Edit className="h-4 w-4" />
                      <span className="text-sm font-medium">Düzenle</span>
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        deleteCategory(category.id);
                      }}
                      className={
                        isDark
                          ? 'flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-600/30 bg-red-600/20 px-3 py-2 text-red-400 transition-all hover:bg-red-600/30'
                          : 'flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800 transition-all hover:bg-red-100'
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="text-sm font-medium">Sil</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Category Modal */}
      {showCreateModal && (
        <CreateCategoryModal
          parentId={selectedParentId}
          categories={categories}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedParentId(null);
            loadCategories();
          }}
        />
      )}

      {/* Edit Category Modal */}
      {showEditModal && selectedCategory && (
        <EditCategoryModal
          category={selectedCategory}
          rootCategories={categories}
          onClose={() => {
            setShowEditModal(false);
            setSelectedCategory(null);
            loadCategories();
          }}
        />
      )}
    </div>
  );
}

// Create Category Modal Component
function CreateCategoryModal({ 
  parentId, 
  categories,
  onClose 
}: { 
  parentId: number | null;
  categories: Category[];
  onClose: () => void 
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [name, setName] = useState('');
  const [sira, setSira] = useState('0');
  const [image, setImage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);

  const parentCategory = findCategoryById(categories, parentId);
  const parentLevel = parentCategory ? parentCategory.level : 0;
  const newLevel = parentLevel + 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Kategori adı girin.');
      setLoading(false);
      return;
    }

    let siraNum = 0;
    const siraTrim = sira.trim();
    if (siraTrim !== '') {
      const parsed = parseInt(siraTrim, 10);
      if (Number.isFinite(parsed)) {
        siraNum = parsed;
      }
    }

    try {
      const response = await adminFetch(
        `${apiFunctionsBase}/admin/categories/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmed,
            parentId,
            sira: siraNum,
            resim: image.trim() || null,
          }),
        }
      );

      const payload = await readResponseJson<{ error?: string; detail?: string; code?: string }>(response);

      if (response.ok) {
        toast.success('Kategori oluşturuldu');
        onClose();
      } else {
        const parts = [payload.error, payload.code ? `[${payload.code}]` : '', payload.detail].filter(Boolean);
        toast.error(parts.length ? parts.join(' — ') : `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('Kategori oluşturulamadı (ağ veya sunucu).');
    } finally {
      setLoading(false);
    }
  };

  const getLevelName = (level: number) => {
    switch (level) {
      case 1: return 'Ana Kategori';
      case 2: return 'Alt Kategori';
      case 3: return 'Sub Kategori';
      default: return `Level ${level}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className={
          isDark
            ? 'w-full max-w-md rounded-2xl border border-slate-600/90 bg-slate-900 p-8 shadow-2xl'
            : 'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl'
        }
        style={{ colorScheme: isDark ? 'dark' : 'light' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-category-title"
      >
        <h2
          id="create-category-title"
          className={
            isDark ? 'mb-6 text-2xl font-semibold text-slate-50' : 'mb-6 text-2xl font-semibold text-slate-900'
          }
        >
          Yeni {getLevelName(newLevel)} Ekle
        </h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="create-category-name"
              className={
                isDark
                  ? 'mb-2 block text-sm font-medium text-slate-300'
                  : 'mb-2 block text-sm font-medium text-slate-600'
              }
            >
              Kategori Adı
            </label>
            <input
              id="create-category-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={
                isDark
                  ? 'w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-slate-50 placeholder:text-slate-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-600/50'
                  : 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/35'
              }
              placeholder={`örn: ${newLevel === 1 ? 'Samsung' : newLevel === 2 ? 'A Serisi' : 'A51'}`}
            />
          </div>
          <div>
            <label
              htmlFor="create-category-sira"
              className={
                isDark
                  ? 'mb-2 block text-sm font-medium text-slate-300'
                  : 'mb-2 block text-sm font-medium text-slate-600'
              }
            >
              Sıra
            </label>
            <input
              id="create-category-sira"
              type="number"
              value={sira}
              onChange={(e) => setSira(e.target.value)}
              className={
                isDark
                  ? 'w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-slate-50 placeholder:text-slate-500 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-600/50'
                  : 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/35'
              }
              placeholder="0"
            />
          </div>
          <CategoryImageFields
            isDark={isDark}
            image={image}
            uploading={uploadingImage}
            fieldClass={
              isDark
                ? 'w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-slate-50 text-sm'
                : 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 text-sm'
            }
            onImageChange={setImage}
            onUpload={async (file) => {
              setUploadingImage(true);
              try {
                setImage(await uploadCategoryImage(file));
                toast.success('Görsel yüklendi');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Görsel yüklenemedi');
              } finally {
                setUploadingImage(false);
              }
            }}
          />
          {parentId && parentCategory && (
            <div
              className={
                isDark
                  ? 'rounded-xl border border-slate-600 bg-slate-950/50 p-4'
                  : 'rounded-xl border border-slate-200 bg-slate-50 p-4'
              }
            >
              <div className={isDark ? 'mb-1 text-xs text-slate-400' : 'mb-1 text-xs text-slate-500'}>
                Üst Kategori
              </div>
              <div className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-900'}>
                {parentCategory.name}
              </div>
              <div className={isDark ? 'mt-1 text-xs text-slate-400' : 'mt-1 text-xs text-slate-500'}>
                Seviye {parentLevel}
              </div>
            </div>
          )}
          <div
            className={
              isDark
                ? 'rounded-xl border border-purple-500/35 bg-purple-950/45 p-4 text-sm text-purple-100'
                : 'rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900'
            }
          >
            <span className="mr-1" aria-hidden>
              📌
            </span>
            Bu kategori{' '}
            <span className={isDark ? 'font-semibold text-purple-50' : 'font-semibold text-purple-950'}>
              Level {newLevel}
            </span>{' '}
            olarak oluşturulacak.
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 font-medium text-[#ffffff] shadow-lg transition-all hover:from-purple-700 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Oluşturuluyor...' : 'Oluştur'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={
                isDark
                  ? 'flex-1 rounded-xl border border-slate-500 bg-slate-800 py-3 font-medium text-slate-100 transition-colors hover:bg-slate-700'
                  : 'flex-1 rounded-xl border border-slate-300 bg-slate-100 py-3 font-medium text-slate-800 transition-colors hover:bg-slate-200'
              }
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryImageFields({
  isDark,
  image,
  uploading,
  fieldClass,
  onImageChange,
  onUpload,
}: {
  isDark: boolean;
  image: string;
  uploading: boolean;
  fieldClass: string;
  onImageChange: (v: string) => void;
  onUpload: (file: File) => Promise<void>;
}) {
  const labelClass = isDark ? 'mb-2 block text-sm font-medium text-slate-300' : 'mb-2 block text-sm font-medium text-slate-600';
  return (
    <div>
      <label className={labelClass}>Kategori görseli (opsiyonel)</label>
      <input
        type="text"
        value={image}
        onChange={(e) => onImageChange(e.target.value)}
        className={fieldClass}
        placeholder="/img/kategori/…"
      />
      <p className={isDark ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
        Görsel kırpılarak{' '}
        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>public/img/kategori</span> altına kaydedilir.
      </p>
      <div className="mt-2">
        <ImageUploadField
          target="category"
          disabled={uploading}
          uploading={uploading}
          onFileReady={onUpload}
        />
      </div>
      {image ? (
        <img
          src={resolveCmsPublicAssetUrl(image)}
          alt="Kategori önizleme"
          className="mt-3 max-h-28 rounded-lg border object-contain"
        />
      ) : null}
    </div>
  );
}

// Edit Category Modal Component
function EditCategoryModal({
  category,
  rootCategories,
  onClose,
}: {
  category: Category;
  rootCategories: Category[];
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [name, setName] = useState(category.name);
  const [aciklama, setAciklama] = useState(category.description ?? '');
  const [sira, setSira] = useState(String(category.order ?? 0));
  const [durum, setDurum] = useState(category.status ?? 'active');
  const [parentSel, setParentSel] = useState(
    category.parentId != null && category.parentId !== undefined ? String(category.parentId) : '',
  );
  const [image, setImage] = useState(category.image ?? '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);

  const blockedParents = collectDescendantIds(category);
  const flat = flattenCategories(rootCategories);
  const parentOptions = flat.filter((c) => !blockedParents.has(c.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const sn = parseInt(String(sira).trim(), 10);
    const body: Record<string, unknown> = {
      name: name.trim(),
      aciklama,
      durum,
      sira: Number.isFinite(sn) ? sn : 0,
      parentId: parentSel === '' ? null : parseInt(parentSel, 10),
      resim: image.trim() || null,
    };

    try {
      const response = await adminFetch(`${apiFunctionsBase}/admin/categories/${category.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let errMsg = '';
      try {
        const j = JSON.parse(text) as { error?: string; detail?: string };
        errMsg = [j.error, j.detail].filter(Boolean).join(' — ');
      } catch {
        errMsg = text.slice(0, 200);
      }

      if (response.ok) {
        toast.success('Kategori güncellendi');
        onClose();
      } else {
        toast.error(errMsg || `HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Güncelleme başarısız');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = isDark
    ? 'w-full rounded-xl border border-slate-600 bg-slate-950/80 px-4 py-3 text-slate-50 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-600/50'
    : 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/35';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className={
          isDark
            ? 'w-full max-w-lg rounded-2xl border border-slate-600/90 bg-slate-900 p-8 shadow-2xl max-h-[90vh] overflow-y-auto'
            : 'w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto'
        }
        style={{ colorScheme: isDark ? 'dark' : 'light' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-category-title"
      >
        <h2
          id="edit-category-title"
          className={
            isDark ? 'mb-6 text-2xl font-semibold text-slate-50' : 'mb-6 text-2xl font-semibold text-slate-900'
          }
        >
          Kategori düzenle
        </h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="edit-category-name"
              className={
                isDark
                  ? 'mb-2 block text-sm font-medium text-slate-300'
                  : 'mb-2 block text-sm font-medium text-slate-600'
              }
            >
              Kategori adı
            </label>
            <input id="edit-category-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <CategoryImageFields
            isDark={isDark}
            image={image}
            uploading={uploadingImage}
            fieldClass={inputClass}
            onImageChange={setImage}
            onUpload={async (file) => {
              setUploadingImage(true);
              try {
                setImage(await uploadCategoryImage(file));
                toast.success('Görsel yüklendi');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Görsel yüklenemedi');
              } finally {
                setUploadingImage(false);
              }
            }}
          />
          <div>
            <label className={isDark ? 'mb-2 block text-sm font-medium text-slate-300' : 'mb-2 block text-sm font-medium text-slate-600'}>
              Üst kategori
            </label>
            <select
              value={parentSel}
              onChange={(e) => setParentSel(e.target.value)}
              className={inputClass}
            >
              <option value="">(Kök — üst yok)</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {'  '.repeat(Math.max(0, (c.level ?? 1) - 1))}
                  {c.name} (id {c.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={isDark ? 'mb-2 block text-sm font-medium text-slate-300' : 'mb-2 block text-sm font-medium text-slate-600'}>
              Açıklama
            </label>
            <textarea
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={isDark ? 'mb-2 block text-sm font-medium text-slate-300' : 'mb-2 block text-sm font-medium text-slate-600'}>
                Sıra
              </label>
              <input type="number" value={sira} onChange={(e) => setSira(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={isDark ? 'mb-2 block text-sm font-medium text-slate-300' : 'mb-2 block text-sm font-medium text-slate-600'}>
                Durum
              </label>
              <select value={durum} onChange={(e) => setDurum(e.target.value)} className={inputClass}>
                <option value="active">active</option>
                <option value="internal_stub">internal_stub</option>
              </select>
            </div>
          </div>
          <div
            className={
              isDark
                ? 'rounded-xl border border-slate-600 bg-slate-950/50 p-4'
                : 'rounded-xl border border-slate-200 bg-slate-50 p-4'
            }
          >
            <div className={isDark ? 'mb-1 text-xs text-slate-400' : 'mb-1 text-xs text-slate-500'}>Seviye</div>
            <div className={isDark ? 'font-medium text-slate-100' : 'font-medium text-slate-900'}>Level {category.level}</div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 py-3 font-medium text-[#ffffff] shadow-lg transition-all hover:from-purple-700 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Güncelleniyor...' : 'Güncelle'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={
                isDark
                  ? 'flex-1 rounded-xl border border-slate-500 bg-slate-800 py-3 font-medium text-slate-100 transition-colors hover:bg-slate-700'
                  : 'flex-1 rounded-xl border border-slate-300 bg-slate-100 py-3 font-medium text-slate-800 transition-colors hover:bg-slate-200'
              }
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
