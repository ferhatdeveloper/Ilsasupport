import { useState } from 'react';

function looksLikeImageSrc(s: string | undefined | null): boolean {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t) || t.startsWith('//')) return true;
  if (!t.startsWith('/')) return false;
  if (/\/img\//i.test(t)) return true;
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(t);
}

type GridIconMediaProps = {
  src?: string | null;
  fallback: string;
  textClassName?: string;
  /** Marka / kategori kartları için görsel yüksekliği */
  size?: 'md' | 'lg';
};

const imgSize: Record<NonNullable<GridIconMediaProps['size']>, string> = {
  md: 'mx-auto max-h-12 w-auto max-w-full object-contain',
  lg: 'mx-auto max-h-14 w-auto max-w-full object-contain',
};

export function GridIconMedia({
  src,
  fallback,
  textClassName = 'text-4xl mb-3',
  size = 'md',
}: GridIconMediaProps) {
  const [broken, setBroken] = useState(false);
  const trimmed = src?.trim();

  if (trimmed && looksLikeImageSrc(trimmed) && !broken) {
    return (
      <div className="mb-3 flex min-h-[3rem] items-center justify-center">
        <img
          src={trimmed}
          alt=""
          className={imgSize[size]}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }

  const emojiOrText = trimmed && !looksLikeImageSrc(trimmed) ? trimmed : fallback;
  return <div className={textClassName}>{emojiOrText}</div>;
}
