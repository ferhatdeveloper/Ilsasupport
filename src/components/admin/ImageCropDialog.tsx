import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Move } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { getCmsImagePreset, type CmsImageTarget } from '../../constants/cmsImageAspects';
import {
  clampCrop,
  initialCropForAspect,
  loadImageFromFile,
  renderCroppedImage,
  blobToFile,
  type RelativeCrop,
} from '../../utils/cropImage';

const VIEWPORT_MAX_W = 560;
const VIEWPORT_MAX_H = 360;

type Props = {
  open: boolean;
  file: File | null;
  target: CmsImageTarget;
  onClose: () => void;
  onConfirm: (file: File) => void;
};

export function ImageCropDialog({ open, file, target, onClose, onConfirm }: Props) {
  const preset = getCmsImagePreset(target);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<RelativeCrop | null>(null);
  const [loadError, setLoadError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; cropX: number; cropY: number } | null>(null);
  useEffect(() => {
    if (!open || !file) {
      setImg(null);
      setCrop(null);
      setLoadError('');
      setZoom(1);
      return;
    }
    let cancelled = false;
    setLoadError('');
    loadImageFromFile(file)
      .then((loaded) => {
        if (cancelled) return;
        setImg(loaded);
        setCrop(initialCropForAspect(loaded.naturalWidth, loaded.naturalHeight, preset.aspectRatio));
        setZoom(1);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, file, preset.aspectRatio]);

  const displayMetrics = useCallback(() => {
    if (!img || !crop) return null;
    const fitScale = Math.min(VIEWPORT_MAX_W / img.naturalWidth, VIEWPORT_MAX_H / img.naturalHeight);
    const scale = fitScale * zoom;
    const dispW = img.naturalWidth * scale;
    const dispH = img.naturalHeight * scale;
    const boxW = crop.width * img.naturalWidth * scale;
    const boxH = crop.height * img.naturalHeight * scale;
    const boxLeft = crop.x * img.naturalWidth * scale;
    const boxTop = crop.y * img.naturalHeight * scale;
    return { scale, dispW, dispH, boxW, boxH, boxLeft, boxTop };
  }, [img, crop, zoom]);

  const metrics = displayMetrics();

  const onPointerDown = (e: React.PointerEvent) => {
    if (!crop || !metrics) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, cropX: crop.x, cropY: crop.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !img || !crop || !metrics) return;
    const dx = (e.clientX - d.startX) / metrics.dispW;
    const dy = (e.clientY - d.startY) / metrics.dispH;
    setCrop(
      clampCrop({
        ...crop,
        x: d.cropX + dx,
        y: d.cropY + dy,
      }),
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleConfirm = async () => {
    if (!img || !crop || !file) return;
    setProcessing(true);
    try {
      const blob = await renderCroppedImage(
        img,
        crop,
        preset.outputWidth,
        preset.outputHeight,
        preset.mimeType,
        preset.quality,
      );
      const out = blobToFile(blob, file.name, preset.mimeType);
      onClose();
      onConfirm(out);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl bg-slate-900 border-slate-700 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-slate-50">Görseli kırp ve boyutlandır</DialogTitle>
          <DialogDescription className="text-slate-400 text-left">
            {preset.label}: {preset.outputWidth}×{preset.outputHeight} px — {preset.hint}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-red-400">{loadError}</p>
        ) : null}

        {metrics && img ? (
          <div className="space-y-3">
            <div
              className="relative mx-auto overflow-hidden rounded-lg border border-slate-600 bg-black/40"
              style={{ width: metrics.dispW, height: metrics.dispH, maxWidth: '100%' }}
            >
              <img
                src={img.src}
                alt=""
                className="absolute inset-0 w-full h-full pointer-events-none select-none"
                draggable={false}
              />
              <div
                role="presentation"
                className="absolute border-2 border-purple-400 cursor-move touch-none"
                style={{
                  left: metrics.boxLeft,
                  top: metrics.boxTop,
                  width: metrics.boxW,
                  height: metrics.boxH,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(255,255,255,0.35)',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <span className="absolute -top-7 left-0 flex items-center gap-1 text-[10px] text-purple-200 whitespace-nowrap">
                  <Move className="w-3 h-3" />
                  Sürükleyerek konumlandır
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="shrink-0">Yakınlaştır</span>
              <button
                type="button"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                aria-label="Uzaklaştır"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-purple-500"
              />
              <button
                type="button"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700"
                onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
                aria-label="Yakınlaştır"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Çıktı: {preset.outputWidth}×{preset.outputHeight} ({preset.mimeType.replace('image/', '')})
            </p>
          </div>
        ) : !loadError ? (
          <p className="text-sm text-slate-400">Görsel yükleniyor…</p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2 text-sm rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={processing || !img || !crop}
            className="px-4 py-2 text-sm rounded-lg bg-purple-700 text-white hover:bg-purple-600 disabled:opacity-50"
          >
            {processing ? 'İşleniyor…' : 'Kırp ve yükle'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
