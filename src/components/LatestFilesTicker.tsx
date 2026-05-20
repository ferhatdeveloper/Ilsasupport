import { useState, useEffect } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import { apiFunctionsBase } from '../utils/supabase/info';
import { authenticatedFetch } from '../utils/secureApi';

interface LatestFilesTickerProps {
  onFileClick?: (fileName: string) => void;
  /** Admin ise API indirme sayısı döner */
  accessToken?: string | null;
  isAdmin?: boolean;
}

export function LatestFilesTicker({ onFileClick, accessToken = null, isAdmin = false }: LatestFilesTickerProps) {
  const [files, setFiles] = useState<any[]>([]);

  useEffect(() => {
    loadLatestFiles();
  }, [accessToken]);

  const loadLatestFiles = async () => {
    try {
      const response = await authenticatedFetch(
        `${apiFunctionsBase}/latest-files?limit=15`,
        {},
        accessToken,
      );

      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('Latest files yükleme hatası:', error);
    }
  };

  if (files.length === 0) {
    return null;
  }

  // Dosyaları 3 kez tekrarla (kesintisiz animasyon için)
  const duplicatedFiles = [...files, ...files, ...files];

  return (
    <div className="latest-files-ticker relative bg-black py-2.5 overflow-hidden border-y border-red-700 shadow-lg">
      {/* Parlama efekti */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-700/20 to-transparent animate-shimmer"></div>
      
      {/* Ana Ticker */}
      <div className="latest-files-ticker-track flex items-center gap-6 whitespace-nowrap">
        {duplicatedFiles.map((file, index) => (
          <button
            key={`${file.id}-${index}`}
            onClick={() => onFileClick?.(file.name)}
            className="flex items-center gap-2 flex-shrink-0 hover:opacity-90 transition-opacity cursor-pointer px-3 py-1 rounded-md hover:bg-red-900/25"
          >
            <TrendingUp className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            <span className="font-bold text-red-500 text-sm uppercase tracking-wide">{file.name}</span>
            <span className="text-red-400 text-xs font-semibold">
              {(() => {
                const n = typeof file.size === 'number' ? file.size : parseFloat(String(file.size ?? ''));
                if (!Number.isFinite(n) || n <= 0) return '';
                return `${(n / 1024 / 1024).toFixed(1)} MB`;
              })()}
            </span>
            {isAdmin && typeof file.downloadCount === 'number' ? (
              <div className="flex items-center gap-1 text-red-400 text-xs font-semibold">
                <Download className="w-3 h-3" />
                {file.downloadCount}
              </div>
            ) : null}
            <span className="text-red-600 mx-1">•</span>
          </button>
        ))}
      </div>
    </div>
  );
}