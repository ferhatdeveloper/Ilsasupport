import { useState, useMemo, useEffect } from 'react';
import { Search, X, Grid3x3, List } from 'lucide-react';
import { GridIconMedia } from './GridIconMedia';
import { fetchBrandMarkaPaths, resolveBrandIconForGrid, type BrandMarkaPaths } from '../utils/marka_paths_client';

interface BrandGridProps {
  brands: any[];
  selectedBrand: string | null;
  onSelectBrand: (brandId: string) => void;
}

export function BrandGrid({ brands, selectedBrand, onSelectBrand }: BrandGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByAlphabet, setGroupByAlphabet] = useState(false); // ✅ Varsayılan: Liste modu
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
  
  const shouldHideBrandName = (name?: string) => {
    const normalized = normalizeSearch(name)
      .replace(/’/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return (
      normalized.includes("(ort) ust kategori dump'ta yok") ||
      (normalized.includes('ust kategori dump') && normalized.includes('yok'))
    );
  };

  const visibleBrands = brands.filter((brand) => !shouldHideBrandName(brand.name));

  // Arama filtreleme
  const normalizedQuery = normalizeSearch(searchQuery);
  const filteredBrands = visibleBrands.filter((brand) =>
    normalizeSearch(brand.name).includes(normalizedQuery) ||
    normalizeSearch(brand.description).includes(normalizedQuery),
  );
  
  // Alfabetik gruplama
  const groupedBrands = useMemo(() => {
    if (!groupByAlphabet) {
      // Gruplama kapalı - tüm markalar tek grupta
      return [{
        letter: null,
        brands: filteredBrands.sort((a, b) => a.name.localeCompare(b.name))
      }];
    }
    
    const groups: { [key: string]: any[] } = {};
    
    filteredBrands.forEach(brand => {
      const firstLetter = brand.name?.charAt(0).toUpperCase() || '#';
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(brand);
    });
    
    // Alfabetik sırala
    return Object.keys(groups)
      .sort()
      .map(letter => ({
        letter,
        brands: groups[letter].sort((a, b) => a.name.localeCompare(b.name))
      }));
  }, [filteredBrands, groupByAlphabet]);
  
  if (visibleBrands.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📦</div>
        <h3 className="text-gray-900 dark:text-white text-xl mb-2">
          Henüz Marka Yok
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Admin Panel'den marka ekleyebilirsiniz
        </p>
      </div>
    );
  }

  return (
    <div data-brand-grid>
      <div className="mb-6">
        <h2 className="text-2xl text-gray-900 dark:text-white mb-2">
          📱 Markalar
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Bir marka seçerek başlayın
        </p>
        
        {/* 🔍 Header: Alfabetik Toggle + Arama */}
        <div className="flex items-center justify-between gap-4">
          {/* Sol: Alfabetik Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGroupByAlphabet(!groupByAlphabet)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                groupByAlphabet
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {groupByAlphabet ? (
                <>
                  <Grid3x3 className="w-4 h-4" />
                  <span className="text-sm font-medium">Alfabetik</span>
                </>
              ) : (
                <>
                  <List className="w-4 h-4" />
                  <span className="text-sm font-medium">Liste</span>
                </>
              )}
            </button>
            
            {/* Sonuç Sayısı */}
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {filteredBrands.length} marka
            </div>
          </div>
          
          {/* Sağ: Minimal Arama Kutusu */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Marka ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-red-50 dark:bg-red-950/30 border-2 border-red-500 rounded-lg shadow-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
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

      {filteredBrands.length > 0 ? (
        <div className="space-y-8">
          {groupedBrands.map(({ letter, brands: groupBrands }) => (
            <div key={letter || 'all'}>
              {/* Alfabetik Başlık (sadece gruplama açıkken) */}
              {letter && groupByAlphabet && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-700 text-white font-bold text-lg shadow-lg">
                    {letter}
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-gray-300 dark:from-gray-700 to-transparent"></div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {groupBrands.length} marka
                  </span>
                </div>
              )}
              
              {/* Marka Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {groupBrands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => onSelectBrand(brand.id)}
                    className={`p-6 rounded-xl border-2 transition-all hover:scale-105 ${
                      selectedBrand === brand.id
                        ? 'border-red-800 bg-red-50 dark:bg-red-900/20'
                        : 'border-red-600 bg-white dark:bg-gray-800 hover:bg-red-600/30 dark:hover:bg-gray-800'
                    }`}
                  >
                    <GridIconMedia
                      src={resolveBrandIconForGrid(brand.name, brand.icon, markaPaths)}
                      fallback="📱"
                    />
                    <h3 className="text-gray-900 dark:text-white font-medium text-sm mb-1">
                      {brand.name}
                    </h3>
                    {brand.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {brand.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-gray-900 dark:text-white text-xl mb-2">
            Sonuç Bulunamadı
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            "{searchQuery}" için marka bulunamadı
          </p>
        </div>
      )}
    </div>
  );
}