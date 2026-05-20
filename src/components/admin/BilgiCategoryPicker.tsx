import { useMemo } from 'react';
import {
  type CategoryRow,
  bilgiFieldsFromSelection,
  childrenOf,
  resolveSelectionFromBilgi,
  rootsOf,
} from './categoryTreeUtils';
import { SearchableSelect } from './SearchableSelect';

type Props = {
  rows: CategoryRow[];
  categoryId: string;
  altkat: string;
  disabled?: boolean;
  isDark?: boolean;
  onChange: (patch: { categoryId: string; altkat: string }) => void;
  labelClass: string;
  fieldClass: string;
  hintClass: string;
};

function toOptions(rows: CategoryRow[]) {
  return rows.map((c) => ({ id: c.id, name: c.name }));
}

/** PHP Ekle.wizard: yan yana ana + alt; alt-alt varsa üçüncü satır — aramalı seçim */
export function BilgiCategoryPicker({
  rows,
  categoryId,
  altkat,
  disabled,
  isDark = false,
  onChange,
  labelClass,
  fieldClass,
  hintClass,
}: Props) {
  const { mainId, subId, leafId } = useMemo(
    () => resolveSelectionFromBilgi(rows, categoryId, altkat),
    [rows, categoryId, altkat],
  );

  const apply = (main: string, sub: string, leaf: string) => {
    onChange(bilgiFieldsFromSelection(main, sub, leaf));
  };

  const roots = rootsOf(rows);
  const subs = mainId ? childrenOf(rows, mainId) : [];
  const leaves = subId ? childrenOf(rows, subId) : [];

  const leafSelectValue =
    leafId && leafId !== subId ? leafId : leaves.length > 0 ? '' : subId || mainId;

  const subPlaceholder = !mainId
    ? 'Önce ana kategori seçin'
    : subs.length === 0
      ? 'Bu markanın alt kategorisi yok'
      : 'Lütfen alt kategori seçiniz';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SearchableSelect
          label="Ana kategori *"
          value={mainId}
          options={toOptions(roots)}
          placeholder="Lütfen ana kategori seçiniz"
          emptyHint="Marka bulunamadı"
          disabled={disabled || roots.length === 0}
          labelClass={labelClass}
          fieldClass={fieldClass}
          isDark={isDark}
          onChange={(id) => apply(id, '', '')}
        />

        <SearchableSelect
          label="Alt kategori *"
          value={subId}
          options={toOptions(subs)}
          placeholder={subPlaceholder}
          emptyHint="Alt kategori bulunamadı"
          disabled={disabled || !mainId || subs.length === 0}
          labelClass={labelClass}
          fieldClass={fieldClass}
          isDark={isDark}
          onChange={(newSub) => {
            const subKids = newSub ? childrenOf(rows, newSub) : [];
            apply(mainId, newSub, subKids.length === 0 ? newSub : '');
          }}
        />
      </div>

      {subId && leaves.length > 0 && (
        <SearchableSelect
          label="Alt-alt kategori *"
          value={leafSelectValue}
          options={toOptions(leaves)}
          placeholder="Lütfen alt-alt kategori seçiniz"
          emptyHint="Alt-alt kategori bulunamadı"
          disabled={disabled}
          labelClass={labelClass}
          fieldClass={fieldClass}
          isDark={isDark}
          onChange={(id) => apply(mainId, subId, id)}
        />
      )}

      <p className={hintClass}>
        <strong>katid</strong> ana marka, <strong>altkat</strong> dosyanın göründüğü klasör (PHP ile aynı). Listelerde
        yazarak arayabilirsiniz.
      </p>
    </div>
  );
}
