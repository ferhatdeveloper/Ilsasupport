import { useState, useEffect } from 'react';
import { FolderOpen, ChevronRight, ChevronLeft, Search, X } from 'lucide-react';
import { GridIconMedia } from './GridIconMedia';
import { fetchBrandMarkaPaths, resolveDirectoryIconForGrid, type BrandMarkaPaths } from '../utils/marka_paths_client';

interface Subcategory {
  id: string;
  name: string;
  parentId: string;
  icon: string;
  fileCount?: number;
}

interface SubcategoryGridProps {
  subcategories: Subcategory[];
  selectedSubcategory: string | null;
  onSelectSubcategory: (id: string) => void;
  categoryName: string;
  brandName: string;
  onBack: () => void;
}

export function SubcategoryGrid({
  subcategories,
  selectedSubcategory,
  onSelectSubcategory,
  categoryName,
  brandName,
  onBack,
}: SubcategoryGridProps) {
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
  
  const shouldHideSubcategoryName = (name?: string) => {
    const normalized = normalizeSearch(name)
      .replace(/’/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return normalized.includes("(ort) üst kategori dump'ta yok");
  };

  const visibleSubcategories = subcategories.filter((subcategory) => !shouldHideSubcategoryName(subcategory.name));

  // Arama filtreleme
  const normalizedQuery = normalizeSearch(searchQuery);
  const filteredSubcategories = visibleSubcategories.filter((subcategory) =>
    normalizeSearch(subcategory.name).includes(normalizedQuery),
  );
  
  if (visibleSubcategories.length === 0) {
    return (
      <div className="mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h3 className="text-gray-900 dark:text-white text-xl mb-2">
            Henüz Alt Kategori Yok
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {categoryName} kategorisi için henüz alt kategori eklenmemiş
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="ilsa-back-btn mb-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
      >
        <ChevronRight className="w-5 h-5 rotate-180" />
        <span>Geri Dön</span>
      </button>

      {/* Page Title */}
      <div className="mb-6">
        <h2 className="ilsa-home-title text-2xl md:text-3xl mb-2">
          {categoryName} - Alt Kategoriler
        </h2>
        <p className="ilsa-home-muted mb-4">
          {visibleSubcategories.length} kategori mevcut
        </p>
        
        {/* 🔍 Header: Sonuç Sayısı + Arama (SAĞ) */}
        <div className="flex items-center justify-between gap-4">
          {/* Sol: Sonuç Sayısı */}
          <div className="text-sm ilsa-home-muted">
            {filteredSubcategories.length} alt kategori
          </div>
          
          {/* Sağ: Minimal Arama Kutusu */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Alt kategori ara..."
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

      {/* Subcategory Grid */}
      {filteredSubcategories.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredSubcategories.map((subcategory) => (
            <button
              key={subcategory.id}
              onClick={() => onSelectSubcategory(subcategory.id)}
              className={`
                group relative overflow-hidden rounded-xl p-6 transition-all duration-300
                border-2
                ${
                  selectedSubcategory === subcategory.id
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-transparent shadow-xl scale-105'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-500 dark:hover:border-purple-400 hover:shadow-lg hover:scale-105'
                }
              `}
            >
              {/* Icon */}
              <div
                className={`
                  mb-3 transition-transform group-hover:scale-110
                  ${selectedSubcategory === subcategory.id ? '' : 'group-hover:rotate-3'}
                `}
              >
                <GridIconMedia
                  src={resolveDirectoryIconForGrid(subcategory.name, subcategory.icon, markaPaths, brandName || categoryName)}
                  fallback="📄"
                  textClassName="text-5xl mb-3"
                  size="lg"
                />
              </div>

              {/* Name */}
              <h3
                className={`
                  mb-1 transition-colors text-center
                  ${
                    selectedSubcategory === subcategory.id
                      ? 'text-white'
                      : 'ilsa-home-title'
                  }
                `}
              >
                {subcategory.name}
              </h3>

              {/* File Count */}
              <p
                className={`
                  text-sm transition-colors text-center
                  ${
                    selectedSubcategory === subcategory.id
                      ? 'text-white/90'
                      : 'ilsa-home-muted'
                  }
                `}
              >
                {subcategory.fileCount} dosya
              </p>

              {/* Hover Effect */}
              {selectedSubcategory !== subcategory.id && (
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-pink-500/0 group-hover:from-purple-500/5 group-hover:to-pink-500/5 transition-all duration-300 pointer-events-none" />
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
            "{searchQuery}" için alt kategori bulunamadı
          </p>
        </div>
      )}
    </div>
  );
}