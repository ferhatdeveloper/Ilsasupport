import { useState, useEffect } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { GridIconMedia } from './GridIconMedia';
import { fetchBrandMarkaPaths, resolveDirectoryIconForGrid, type BrandMarkaPaths } from '../utils/marka_paths_client';

interface CategoryGridProps {
  categories: any[];
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  brandName: string;
  onBack: () => void;
}

export function CategoryGrid({ categories, selectedCategory, onSelectCategory, brandName, onBack }: CategoryGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [markaPaths, setMarkaPaths] = useState<BrandMarkaPaths | null>(null);

  const normalizeSearch = (value?: string) =>
    String(value || '')
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  useEffect(() => {
    fetchBrandMarkaPaths().then(setMarkaPaths);
  }, []);
  
  const shouldHideCategoryName = (name?: string) => {
    const normalized = normalizeSearch(name)
      .replace(/’/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return normalized.includes("(ort) üst kategori dump'ta yok");
  };

  const visibleCategories = categories.filter((category) => !shouldHideCategoryName(category.name));

  // Arama filtreleme
  const normalizedQuery = normalizeSearch(searchQuery);
  const filteredCategories = visibleCategories.filter((category) =>
    normalizeSearch(category.name).includes(normalizedQuery) ||
    normalizeSearch(category.description).includes(normalizedQuery),
  );
  
  if (visibleCategories.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📁</div>
        <h3 className="text-gray-900 dark:text-white text-xl mb-2">
          Henüz Kategori Yok
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          {brandName} markası için kategori bulunmamaktadır
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="ilsa-back-btn mb-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Geri Dön</span>
      </button>

      <div className="mb-6">
        <h2 className="text-2xl ilsa-home-title mb-2">
          📂 {brandName} Kategorileri
        </h2>
        <p className="ilsa-home-muted mb-4">
          Bir kategori seçin
        </p>
        
        {/* 🔍 Header: Sonuç Sayısı + Arama (SAĞ) */}
        <div className="flex items-center justify-between gap-4">
          {/* Sol: Sonuç Sayısı */}
          <div className="text-sm ilsa-home-muted">
            {filteredCategories.length} kategori
          </div>
          
          {/* Sağ: Minimal Arama Kutusu */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Kategori ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-lg ilsa-surface ilsa-home-title placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {filteredCategories.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category.id)}
              className={`p-6 rounded-xl border-2 transition-all hover:scale-105 ${
                selectedCategory === category.id
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-700'
              }`}
            >
              <GridIconMedia
                src={resolveDirectoryIconForGrid(category.name, category.icon, markaPaths, brandName)}
                fallback="📁"
              />
              <h3 className="ilsa-home-title font-medium text-sm mb-1">
                {category.name}
              </h3>
              {category.description && (
                <p className="text-xs ilsa-home-muted line-clamp-2">
                  {category.description}
                </p>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="ilsa-home-title text-xl mb-2">
            Sonuç Bulunamadı
          </h3>
          <p className="ilsa-home-muted">
            "{searchQuery}" için kategori bulunamadı
          </p>
        </div>
      )}
    </div>
  );
}