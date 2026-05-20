import { Download } from 'lucide-react';
import { useDesktopAppConfig } from '../hooks/useDesktopAppConfig';

interface DesktopAppDownloadProps {
  variant?: 'button' | 'link';
  className?: string;
}

export function DesktopAppDownload({ variant = 'button', className = '' }: DesktopAppDownloadProps) {
  const { downloadUrl, downloadFilename, latestVersion } = useDesktopAppConfig();
  const base =
    variant === 'button'
      ? 'ilsa-portable-download-btn'
      : 'inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 hover:underline text-sm font-medium';

  return (
    <a
      href={downloadUrl}
      download={downloadFilename}
      className={`${base} ${className}`.trim()}
      title={`Sürüm ${latestVersion}`}
    >
      <Download className="w-4 h-4 shrink-0" aria-hidden />
      Windows Portable İndir ({latestVersion})
    </a>
  );
}
