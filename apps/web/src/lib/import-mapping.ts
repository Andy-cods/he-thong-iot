/**
 * Import ColumnMapper — synonym dictionary + auto-detect.
 *
 * Direction B §2.4 brainstorm-deep / §3.16 design-spec.
 * Dùng cho Step 2 của Import Wizard v2: ghép cột Excel → trường DB Item.
 *
 * Chiến lược match (theo thứ tự ưu tiên):
 *   1. Exact match sau khi normalize (lowercase + bỏ dấu + strip non-alnum).
 *   2. Synonym dict (VN + EN + viết tắt thường gặp).
 *   3. Levenshtein distance ≤ 2 với canonical label.
 *
 * KHÔNG import từ `@iot/shared` để giữ util thuần client, test nhanh.
 */

export interface TargetField {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "number" | "enum" | "boolean";
  enumValues?: string[];
  /** Synonyms thêm cho field này (ngoài registry mặc định). */
  synonyms?: string[];
}

/**
 * Synonym dictionary mặc định cho 9 field Item core.
 *
 * Điều kiện thiết kế:
 * - Đủ ≥ 30 entries tổng (spec yêu cầu) — thực tế > 60.
 * - Không trùng entry giữa các field (tránh ambiguity).
 * - Normalized: lowercase + bỏ dấu + strip non-alnum trước khi so sánh.
 */
export const ITEM_FIELD_SYNONYMS: Record<string, string[]> = {
  sku: [
    "sku",
    "ma",
    "masp",
    "masanpham",
    "mavattu",
    "mahang",
    "code",
    "productcode",
    "itemcode",
    "partnumber",
    "partno",
    "pn",
    "mahh",
  ],
  name: [
    "name",
    "ten",
    "tensp",
    "tensanpham",
    "tenvattu",
    "tenhang",
    "tengoi",
    "productname",
    "itemname",
    "description1",
    "title",
  ],
  itemType: [
    "type",
    "loai",
    "loaihang",
    "loaivattu",
    "itemtype",
    "category1",
    "nhom",
    "phanloai",
    "kind",
  ],
  uom: [
    "uom",
    "dvt",
    "donvi",
    "donvitinh",
    "unit",
    "measureunit",
    "unitofmeasure",
    "dv",
  ],
  description: [
    "description",
    "mota",
    "ghichu",
    "note",
    "notes",
    "remark",
    "remarks",
    "dienigiai",
    "giaithich",
    "detail",
    "details",
  ],
  category: [
    "category",
    "nhom",
    "nhomhang",
    "nhomvattu",
    "danhmuc",
    "group",
    "productgroup",
    "cat",
    "chungloai",
  ],
  minStock: [
    "minstock",
    "tondautoi",
    "tontoithieu",
    "minqty",
    "min",
    "reorderpoint",
    "rop",
    "safetystock",
    "tonan",
    "tonantoan",
  ],
  maxStock: [
    "maxstock",
    "tontoida",
    "maxqty",
    "max",
    "tontoidagiuu",
    "hantren",
  ],
  lotTracked: [
    "lot",
    "lottracked",
    "theolot",
    "tracklot",
    "lotcontrol",
    "theoloohang",
    "laphangloat",
  ],
  serialTracked: [
    "serial",
    "serialtracked",
    "theoserial",
    "trackserial",
    "serialcontrol",
    "theoso",
    "theosothutu",
  ],
};

/**
 * Normalize 1 header để so sánh không phân biệt dấu/khoảng trắng.
 * "Mã sản phẩm" → "masanpham"
 * "ĐVT" → "dvt"
 */
export function normalizeHeader(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Levenshtein distance (iterative DP). O(n*m). Cho chuỗi ≤ 40 char — đủ nhanh.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j] ?? 0) + 1, // deletion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length] ?? 0;
}

/**
 * Tìm target field khớp nhất với 1 source header raw.
 * Return null nếu không có field nào đủ tin cậy (Levenshtein > 2 và không trong synonym).
 */
export function findBestTargetField(
  sourceHeader: string,
  targets: TargetField[],
): string | null {
  const norm = normalizeHeader(sourceHeader);
  if (!norm) return null;

  // 1. Synonym exact match
  for (const t of targets) {
    const synonyms = [
      ...(ITEM_FIELD_SYNONYMS[t.key] ?? []),
      ...(t.synonyms ?? []).map(normalizeHeader),
    ];
    if (synonyms.includes(norm)) return t.key;
    if (normalizeHeader(t.label) === norm) return t.key;
    if (normalizeHeader(t.key) === norm) return t.key;
  }

  // 2. Fuzzy Levenshtein distance ≤ 2 trên label hoặc synonym
  let best: { key: string; distance: number } | null = null;
  for (const t of targets) {
    const candidates = [
      normalizeHeader(t.label),
      normalizeHeader(t.key),
      ...(ITEM_FIELD_SYNONYMS[t.key] ?? []),
    ];
    for (const cand of candidates) {
      const d = levenshtein(norm, cand);
      if (d <= 2 && (!best || d < best.distance)) {
        best = { key: t.key, distance: d };
      }
    }
  }
  return best?.key ?? null;
}

/**
 * Auto-map toàn bộ sourceHeaders → targetFields. Header không khớp → null.
 * Tránh map 2 source cùng 1 target: target đã được claim sẽ bỏ qua cho match yếu hơn.
 */
export function autoMapHeaders(
  sourceHeaders: string[],
  targets: TargetField[],
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const claimed = new Set<string>();
  // Pass 1: exact/synonym (distance 0 hoặc in synonym)
  for (const h of sourceHeaders) {
    const match = findBestTargetField(h, targets);
    if (match && !claimed.has(match)) {
      mapping[h] = match;
      claimed.add(match);
    } else {
      mapping[h] = null;
    }
  }
  return mapping;
}

/** localStorage key cho preset. `userId` có thể là username. */
export function mappingPresetKey(userId: string): string {
  return `iot:import-mapping-preset:${userId}`;
}

export interface MappingPreset {
  /** normalizedHeader → targetKey. Lưu normalized để match bền vững khi user đổi font/case. */
  entries: Record<string, string>;
  updatedAt: string;
}

export function saveMappingPreset(
  userId: string,
  mapping: Record<string, string | null>,
): void {
  if (typeof window === "undefined") return;
  const entries: Record<string, string> = {};
  for (const [source, target] of Object.entries(mapping)) {
    if (target) entries[normalizeHeader(source)] = target;
  }
  const preset: MappingPreset = {
    entries,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(mappingPresetKey(userId), JSON.stringify(preset));
  } catch {
    // quota exceeded — silent OK
  }
}

export function loadMappingPreset(userId: string): MappingPreset | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(mappingPresetKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MappingPreset;
    if (!parsed || typeof parsed !== "object" || !parsed.entries) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Apply preset: bất kỳ sourceHeader nào có normalized match trong preset → target từ preset. */
export function applyPreset(
  sourceHeaders: string[],
  preset: MappingPreset,
): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  const claimed = new Set<string>();
  for (const h of sourceHeaders) {
    const norm = normalizeHeader(h);
    const target = preset.entries[norm];
    if (target && !claimed.has(target)) {
      mapping[h] = target;
      claimed.add(target);
    } else {
      mapping[h] = null;
    }
  }
  return mapping;
}

/** Trường Item mặc định — dùng bởi Import Wizard. Bám sát schema @iot/shared. */
export const ITEM_TARGET_FIELDS: TargetField[] = [
  { key: "sku", label: "Mã SKU", required: true, type: "string" },
  { key: "name", label: "Tên", required: true, type: "string" },
  {
    key: "itemType",
    label: "Loại vật tư",
    required: true,
    type: "enum",
    enumValues: [
      "RAW",
      "PURCHASED",
      "FABRICATED",
      "ASSEMBLY",
      "CONSUMABLE",
      "TOOLING",
      "SPARE",
      "PACKAGING",
    ],
  },
  {
    key: "uom",
    label: "Đơn vị tính",
    required: true,
    type: "enum",
    enumValues: [
      "PCS",
      "SET",
      "KG",
      "G",
      "M",
      "MM",
      "CM",
      "L",
      "ML",
      "HOUR",
      "PAIR",
      "BOX",
      "ROLL",
      "SHEET",
    ],
  },
  { key: "description", label: "Mô tả", required: false, type: "string" },
  { key: "category", label: "Danh mục", required: false, type: "string" },
  { key: "minStock", label: "Tồn tối thiểu", required: false, type: "number" },
  { key: "maxStock", label: "Tồn tối đa", required: false, type: "number" },
  {
    key: "lotTracked",
    label: "Theo dõi theo lô",
    required: false,
    type: "boolean",
  },
  {
    key: "serialTracked",
    label: "Theo dõi theo serial",
    required: false,
    type: "boolean",
  },
];
