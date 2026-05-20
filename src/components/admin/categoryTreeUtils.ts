/** Bilgi formu — PHP Ekle.wizard: katid (ana), altkat (alt / liste klasörü) */

export type CategoryRow = {
  id: string;
  name: string;
  parentId: string | null;
};

export function toCategoryRow(raw: {
  id: number | string;
  name?: string;
  parentId?: number | string | null;
}): CategoryRow {
  const pid = raw.parentId;
  return {
    id: String(raw.id),
    name: String(raw.name || ''),
    parentId: pid == null || pid === '' ? null : String(pid),
  };
}

export function childrenOf(rows: CategoryRow[], parentId: string | null): CategoryRow[] {
  const key = parentId ?? '';
  return rows
    .filter((r) => (r.parentId ?? '') === key)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

export function rootsOf(rows: CategoryRow[]): CategoryRow[] {
  return childrenOf(rows, null);
}

export function resolveSelectionFromBilgi(
  rows: CategoryRow[],
  katid: string,
  altkat: string,
): { mainId: string; subId: string; leafId: string } {
  const kat = String(katid ?? '').trim();
  const alt = String(altkat ?? '').trim();
  const target = /^[0-9]+$/.test(alt) ? alt : /^[0-9]+$/.test(kat) ? kat : '';
  if (!target) return { mainId: '', subId: '', leafId: '' };

  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: CategoryRow[] = [];
  let cur = byId.get(target);
  let guard = 0;
  while (cur && guard++ < 12) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  return {
    mainId: chain[0]?.id ?? '',
    subId: chain[1]?.id ?? '',
    leafId: chain[chain.length - 1]?.id ?? '',
  };
}

export function bilgiFieldsFromSelection(
  mainId: string,
  subId: string,
  leafId: string,
): { categoryId: string; altkat: string } {
  const main = String(mainId ?? '').trim();
  const sub = String(subId ?? '').trim();
  const leaf = String(leafId ?? '').trim();
  return {
    categoryId: main,
    altkat: leaf || sub || main,
  };
}

/** Liste satırı: ana marka (katid) + alt yol (altkat zinciri) */
export function bilgiCategoryLabels(
  rows: CategoryRow[],
  katid: string,
  altkat: string,
): { mainCategoryName: string; subCategoryName: string; listCategoryName: string } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const kat = String(katid ?? '').trim();
  const alt = String(altkat ?? '').trim();
  const mainRow = /^[0-9]+$/.test(kat) ? byId.get(kat) : undefined;
  const mainCategoryName = mainRow?.name ?? (kat || '—');

  const leafKey = /^[0-9]+$/.test(alt) ? alt : /^[0-9]+$/.test(kat) ? kat : '';
  if (!leafKey) {
    return { mainCategoryName, subCategoryName: '—', listCategoryName: '—' };
  }

  const mainId = /^[0-9]+$/.test(kat) ? kat : '';
  const chain: CategoryRow[] = [];
  let cur = byId.get(leafKey);
  let guard = 0;
  while (cur && guard++ < 12) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }

  const listCategoryName = chain[chain.length - 1]?.name ?? leafKey;
  let subCategoryName = '—';
  if (alt && kat && alt !== kat && chain.length > 1) {
    const mainIdx = mainId ? chain.findIndex((c) => c.id === mainId) : 0;
    const tail = mainIdx >= 0 ? chain.slice(mainIdx + 1) : chain.slice(1);
    if (tail.length > 0) subCategoryName = tail.map((c) => c.name).join(' › ');
    else subCategoryName = listCategoryName;
  } else if (alt && kat && alt !== kat) {
    subCategoryName = listCategoryName;
  }

  return { mainCategoryName, subCategoryName, listCategoryName };
}

export function validateCategorySelection(
  rows: CategoryRow[],
  mainId: string,
  subId: string,
  leafId: string,
): string | null {
  if (!mainId) return 'Ana kategori seçin';
  const subs = childrenOf(rows, mainId);
  if (subs.length > 0 && !subId) return 'Alt kategori seçin';
  const subChildren = subId ? childrenOf(rows, subId) : [];
  if (subChildren.length > 0 && !leafId) return 'Alt-alt kategori seçin';
  const { categoryId, altkat } = bilgiFieldsFromSelection(mainId, subId, leafId);
  if (!/^[0-9]+$/.test(categoryId) || !/^[0-9]+$/.test(altkat)) {
    return 'Geçerli kategori seçin';
  }
  return null;
}
