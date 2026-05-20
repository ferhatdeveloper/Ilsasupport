import { Star } from 'lucide-react';

type FavoriteStarButtonProps = {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
};

/** Dosya kartlarında favori yıldızı — aktifken sarı dolu görünür */
export function FavoriteStarButton({
  active,
  onToggle,
  disabled = false,
  size = 'md',
  className = '',
}: FavoriteStarButtonProps) {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const padding = size === 'sm' ? 'p-2' : 'p-2.5';

  return (
    <button
      type="button"
      title={active ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      aria-pressed={active}
      aria-label={active ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={[
        padding,
        'rounded-lg border transition-all duration-200',
        active
          ? 'border-yellow-400 bg-yellow-400/20 ring-2 ring-yellow-400/50 shadow-sm shadow-yellow-500/25'
          : 'border-gray-300 bg-white/80 hover:border-yellow-400/70 hover:bg-yellow-50 dark:border-gray-600 dark:bg-transparent dark:hover:bg-yellow-900/20',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Star
        className={[
          iconSize,
          'transition-colors duration-200',
          active
            ? 'fill-yellow-400 stroke-yellow-500 text-yellow-400'
            : 'fill-transparent stroke-gray-400 text-gray-400',
        ].join(' ')}
        strokeWidth={active ? 2 : 1.75}
      />
    </button>
  );
}
