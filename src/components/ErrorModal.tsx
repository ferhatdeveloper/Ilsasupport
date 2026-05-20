import React from 'react';
import { X, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  errorCode?: string;
  fallbackUrl?: string;
  onRetry?: () => void;
}

export function ErrorModal({
  isOpen,
  onClose,
  title,
  message,
  errorCode,
  fallbackUrl,
  onRetry,
}: ErrorModalProps) {
  if (!isOpen) return null;

  const handleOpenFallback = () => {
    if (fallbackUrl) {
      window.open(fallbackUrl, '_blank');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <h2 className="text-lg text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1 hover:bg-zinc-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-zinc-300 leading-relaxed">{message}</p>

          {errorCode && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">Hata Kodu</p>
              <p className="text-sm text-zinc-300 font-mono">{errorCode}</p>
            </div>
          )}

          {errorCode === 'downloadQuotaExceeded' && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 space-y-2">
              <p className="text-sm text-amber-200">
                💡 <span className="font-medium">Bu hata şu sebeplerden kaynaklanabilir:</span>
              </p>
              <ul className="text-sm text-amber-200/80 space-y-1 ml-4">
                <li>• Bu dosya çok fazla indirilmiş (Google limit koymuş)</li>
                <li>• Google Drive günlük quota sınırı aşılmış</li>
                <li>• Dosya sahibinin hesabında sorun olabilir</li>
              </ul>
              <p className="text-sm text-amber-200 mt-3">
                🔄 <span className="font-medium">Çözüm:</span> Birkaç saat sonra tekrar deneyin veya dosya sahibine bildirin.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 bg-zinc-800/30 border-t border-zinc-800">
          {fallbackUrl && (
            <button
              onClick={handleOpenFallback}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Google Drive'da Aç
            </button>
          )}
          
          {onRetry && (
            <button
              onClick={() => {
                onRetry();
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Tekrar Dene
            </button>
          )}
          
          <button
            onClick={onClose}
            className={`${fallbackUrl || onRetry ? 'flex-1' : 'w-full'} px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors`}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
