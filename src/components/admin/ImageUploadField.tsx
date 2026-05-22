import { useRef, useState } from 'react';
import { Crop } from 'lucide-react';
import {
  getCmsImagePreset,
  shouldSkipCrop,
  type CmsImageTarget,
} from '../../constants/cmsImageAspects';
import { ImageCropDialog } from './ImageCropDialog';

type Props = {
  target: CmsImageTarget;
  disabled?: boolean;
  uploading?: boolean;
  onFileReady: (file: File) => void | Promise<void>;
  className?: string;
  accept?: string;
  hint?: string;
};

export function ImageUploadField({
  target,
  disabled,
  uploading,
  onFileReady,
  className = '',
  accept = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.svg',
  hint,
}: Props) {
  const preset = getCmsImagePreset(target);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const handleFile = (file: File) => {
    if (shouldSkipCrop(file)) {
      void onFileReady(file);
      return;
    }
    setPendingFile(file);
    setCropOpen(true);
  };

  const defaultHint =
    hint ??
    `Dosya seçin — sistem ${preset.outputWidth}×${preset.outputHeight} px (${preset.label}) olarak kırpar. SVG/GIF doğrudan yüklenir.`;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className={`hidden ${className}`}
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = '';
          if (f) handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded file:border-0 bg-purple-700 text-white hover:bg-purple-600 disabled:opacity-50"
      >
        <Crop className="w-3.5 h-3.5" />
        {uploading ? 'Yükleniyor…' : 'Görsel seç ve kırp'}
      </button>
      <p className="mt-1 text-[11px] text-slate-500">{defaultHint}</p>

      <ImageCropDialog
        open={cropOpen}
        file={pendingFile}
        target={target}
        onClose={() => {
          setCropOpen(false);
          setPendingFile(null);
        }}
        onConfirm={(file) => {
          void onFileReady(file);
          setPendingFile(null);
        }}
      />
    </>
  );
}
