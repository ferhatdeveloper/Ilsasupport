/** Görsel dosyasını yükler (EXIF yönü tarayıcıda uygulanır) */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel okunamadı'));
    };
    img.src = url;
  });
}

/** 0–1 aralığında kaynak görsel üzerinde kırpma alanı */
export type RelativeCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Verilen en-boy oranına sığan en büyük kırpma alanını merkeze yerleştirir */
export function initialCropForAspect(naturalWidth: number, naturalHeight: number, aspectRatio: number): RelativeCrop {
  const imgRatio = naturalWidth / naturalHeight;
  let cropW: number;
  let cropH: number;
  if (imgRatio > aspectRatio) {
    cropH = naturalHeight;
    cropW = naturalHeight * aspectRatio;
  } else {
    cropW = naturalWidth;
    cropH = naturalWidth / aspectRatio;
  }
  const x = (naturalWidth - cropW) / 2;
  const y = (naturalHeight - cropH) / 2;
  return {
    x: x / naturalWidth,
    y: y / naturalHeight,
    width: cropW / naturalWidth,
    height: cropH / naturalHeight,
  };
}

export function clampCrop(crop: RelativeCrop): RelativeCrop {
  const w = Math.min(1, Math.max(0.01, crop.width));
  const h = Math.min(1, Math.max(0.01, crop.height));
  const x = Math.min(1 - w, Math.max(0, crop.x));
  const y = Math.min(1 - h, Math.max(0, crop.y));
  return { x, y, width: w, height: h };
}

export async function renderCroppedImage(
  img: HTMLImageElement,
  crop: RelativeCrop,
  outputWidth: number,
  outputHeight: number,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor');

  const sx = crop.x * img.naturalWidth;
  const sy = crop.y * img.naturalHeight;
  const sw = crop.width * img.naturalWidth;
  const sh = crop.height * img.naturalHeight;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Görsel dışa aktarılamadı'))),
      mimeType,
      quality,
    );
  });
}

export function blobToFile(blob: Blob, baseName: string, mimeType: string): File {
  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const safe = baseName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'gorsel';
  return new File([blob], `${safe}-cropped.${ext}`, { type: mimeType, lastModified: Date.now() });
}
