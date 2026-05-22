import { useState } from 'react';
import { Download, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { useDesktopAppConfig } from '../hooks/useDesktopAppConfig';

interface DesktopAppDownloadProps {
  variant?: 'button' | 'link';
  className?: string;
}

export function DesktopAppDownload({ variant = 'button', className = '' }: DesktopAppDownloadProps) {
  const { downloadUrl, downloadFilename, latestVersion } = useDesktopAppConfig();
  const zipUrl = downloadUrl.replace(/\.exe$/i, '.zip');
  const [showHelp, setShowHelp] = useState(false);

  if (variant === 'link') {
    return (
      <div className={`space-y-2 ${className}`.trim()}>
        <a
          href={downloadUrl}
          download={downloadFilename}
          className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 hover:underline text-sm font-medium"
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden />
          Portable (.exe) {latestVersion}
        </a>
        <a
          href={zipUrl}
          download={downloadFilename.replace(/\.exe$/i, '.zip')}
          className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden />
          ZIP indir
        </a>
      </div>
    );
  }

  return (
    <div className={`ilsa-download-buttons ${className}`.trim()}>
      <div className="ilsa-download-buttons__row">
        <a
          href={downloadUrl}
          download={downloadFilename}
          className="ilsa-portable-download-btn ilsa-portable-download-btn--exe"
          title={`Portable ${latestVersion}`}
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden />
          <span>Windows Portable (.exe)</span>
          <span className="ilsa-download-ver">{latestVersion}</span>
        </a>
        <a
          href={zipUrl}
          download={downloadFilename.replace(/\.exe$/i, '.zip')}
          className="ilsa-portable-download-btn ilsa-portable-download-btn--zip"
          title="ZIP içinden .exe çıkarın"
        >
          <Download className="w-4 h-4 shrink-0" aria-hidden />
          <span>{'ZIP olarak indir'}</span>
        </a>
      </div>

      <button
        type="button"
        onClick={() => setShowHelp((v) => !v)}
        className="ilsa-download-help-toggle"
      >
        <ShieldAlert className="w-4 h-4 shrink-0" />
        Windows uyarısı (SmartScreen / antivirüs)
        {showHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {showHelp && (
        <div className="ilsa-download-help-panel">
          <p>
            <strong>Bu bir virüs değildir.</strong> İmzasız portable olduğu için Windows ilk açılışta uyarı verebilir.
          </p>
          <p className="font-medium">Çalıştırırken: «Yine de çalıştır» seçin.</p>
          <p>İndirme engellenirse mavi <strong>ZIP olarak indir</strong> düğmesini kullanın.</p>
        </div>
      )}
    </div>
  );
}
