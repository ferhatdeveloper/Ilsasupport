import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export type SearchableOption = {
  id: string;
  name: string;
};

type Props = {
  label: string;
  value: string;
  options: SearchableOption[];
  placeholder: string;
  emptyHint?: string;
  disabled?: boolean;
  labelClass: string;
  fieldClass: string;
  isDark?: boolean;
  onChange: (id: string) => void;
};

function matchesQuery(opt: SearchableOption, q: string): boolean {
  if (!q) return true;
  const n = opt.name.toLocaleLowerCase('tr');
  return n.includes(q) || opt.id.includes(q);
}

export function SearchableSelect({
  label,
  value,
  options,
  placeholder,
  emptyHint = 'Sonuç yok',
  disabled,
  labelClass,
  fieldClass,
  isDark = false,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return options.filter((o) => matchesQuery(o, q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const listClass = isDark
    ? 'absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-600 bg-gray-900 shadow-xl'
    : 'absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg';

  const searchWrapClass = isDark
    ? 'sticky top-0 border-b border-gray-700 bg-gray-900 p-2'
    : 'sticky top-0 border-b border-slate-200 bg-white p-2';

  const searchInputClass = isDark
    ? 'w-full rounded-md border border-gray-600 bg-gray-800 py-1.5 pl-8 pr-2 text-sm text-white placeholder:text-gray-500'
    : 'w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm text-slate-900 placeholder:text-slate-400';

  const itemClass = (active: boolean) =>
    isDark
      ? `w-full text-left px-3 py-2 text-sm ${active ? 'bg-purple-900/50 text-white' : 'text-gray-200 hover:bg-gray-800'}`
      : `w-full text-left px-3 py-2 text-sm ${active ? 'bg-purple-50 text-purple-900' : 'text-slate-800 hover:bg-slate-50'}`;

  return (
    <div ref={wrapRef} className="relative">
      <label className={labelClass}>{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          if (!open) setQuery('');
        }}
        className={`${fieldClass} flex items-center justify-between gap-2 text-left disabled:opacity-50`}
      >
        <span className={selected ? '' : 'opacity-60'}>{selected?.name ?? placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={listClass} role="listbox">
          <div className={`${searchWrapClass} relative`}>
            <Search
              className={`pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-slate-400'}`}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ara…"
              className={searchInputClass}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                  setQuery('');
                }
              }}
            />
          </div>
          {value && (
            <button
              type="button"
              className={`${itemClass(false)} border-b ${isDark ? 'border-gray-800 text-gray-400' : 'border-slate-100 text-slate-500'}`}
              onClick={() => {
                onChange('');
                setOpen(false);
                setQuery('');
              }}
            >
              — Seçimi temizle —
            </button>
          )}
          {filtered.length === 0 ? (
            <p className={`px-3 py-3 text-sm ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>{emptyHint}</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={opt.id === value}
                className={itemClass(opt.id === value)}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                  setQuery('');
                }}
              >
                {opt.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
