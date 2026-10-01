"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, MapPin, Search, Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * V4.3 — `<BinSuggestCombobox>` dùng chung: wizard nhận hàng (`LineRow`) +
 * dialog hoàn thành WO (nhập kho thành phẩm) — mục 4.1.3/4.2.3
 * `WAREHOUSE_UX_AND_FLOW.md`.
 *
 * Thay `<select>` phẳng liệt kê toàn bộ bin bằng combobox: gợi ý #1 (từ
 * `GET /api/warehouse/putaway-suggestion`) đứng đầu kèm lý do tiếng Việt,
 * phần còn lại nhóm theo khu/kệ, có ô tìm. API lỗi/chậm → vẫn chọn được bin
 * như cũ (danh sách "Khác" luôn có đủ, không phụ thuộc gợi ý).
 */

export interface BinOption {
  id: string;
  fullCode: string;
  isActive: boolean;
  area?: string | null;
  rack?: string | null;
}

interface PutawaySuggestionDto {
  binId: string;
  binFullCode: string;
  reasonCode:
    | "SAME_ITEM"
    | "DEFAULT_BIN"
    | "SAME_ZONE_CATEGORY"
    | "MOST_CAPACITY"
    | "STAGING_FALLBACK";
  reason: string;
  remainingCapacity: number | null;
}

export interface BinSuggestComboboxProps {
  /** Item cần cất — dùng để gọi API gợi ý. */
  itemId: string | null | undefined;
  /** SL cần cất — dùng để lọc bin đủ chỗ. */
  qty: number;
  /** Toàn bộ bin active (fallback khi API gợi ý lỗi/chưa tải xong). */
  bins: BinOption[];
  /** binId đang chọn, "" = chưa chọn. */
  value: string;
  onChange: (binId: string) => void;
  disabled?: boolean;
  /** Nhãn khi chưa chọn gì (mặc định "— Chưa gán —"). */
  placeholder?: string;
  /** Text gợi ý hiện dưới trigger khi chưa chọn (vd "Sẽ vào: Chờ xếp kệ"). */
  hintWhenEmpty?: string | null;
  className?: string;
  "aria-label"?: string;
}

/** Cache nhỏ trong module — tránh gọi lại API khi (itemId, qty làm tròn) không đổi giữa các lần mở popover trong cùng phiên trang. */
const suggestionCache = new Map<string, PutawaySuggestionDto[]>();

function cacheKey(itemId: string, qty: number): string {
  return `${itemId}|${Math.max(1, Math.ceil(qty || 1))}`;
}

async function fetchSuggestions(
  itemId: string,
  qty: number,
  signal: AbortSignal,
): Promise<PutawaySuggestionDto[]> {
  const key = cacheKey(itemId, qty);
  const cached = suggestionCache.get(key);
  if (cached) return cached;
  const res = await fetch(
    `/api/warehouse/putaway-suggestion?itemId=${encodeURIComponent(itemId)}&qty=${Math.max(1, qty || 1)}`,
    { signal },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { data?: PutawaySuggestionDto[] };
  const data = json.data ?? [];
  suggestionCache.set(key, data);
  return data;
}

export function BinSuggestCombobox({
  itemId,
  qty,
  bins,
  value,
  onChange,
  disabled,
  placeholder = "— Chưa gán —",
  hintWhenEmpty,
  className,
  "aria-label": ariaLabel,
}: BinSuggestComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<PutawaySuggestionDto[]>([]);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    if (!open || !itemId) return;
    const ctrl = new AbortController();
    setLoadError(false);
    fetchSuggestions(itemId, qty, ctrl.signal)
      .then((data) => setSuggestions(data))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setSuggestions([]);
        setLoadError(true);
        // eslint-disable-next-line no-console
        console.warn("putaway-suggestion fetch failed", err);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, qty]);

  const binsById = React.useMemo(() => new Map(bins.map((b) => [b.id, b])), [bins]);
  const activeBins = React.useMemo(() => bins.filter((b) => b.isActive), [bins]);

  const suggestedIdSet = React.useMemo(
    () => new Set(suggestions.map((s) => s.binId)),
    [suggestions],
  );

  const q = query.trim().toLowerCase();
  const filteredSuggestions = suggestions.filter(
    (s) => !q || s.binFullCode.toLowerCase().includes(q),
  );
  const otherBins = activeBins.filter(
    (b) => !suggestedIdSet.has(b.id) && (!q || b.fullCode.toLowerCase().includes(q)),
  );

  // Nhóm "Khác" theo khu (area) rồi kệ (rack) — bin không có area/rack rơi vào nhóm "Khác".
  const grouped = React.useMemo(() => {
    const map = new Map<string, BinOption[]>();
    for (const b of otherBins) {
      const key = b.area ? `Khu ${b.area}${b.rack ? ` · Kệ ${b.rack}` : ""}` : "Khác";
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [otherBins]);

  const selectedBin = value ? binsById.get(value) : undefined;
  const selectedSuggestion = value
    ? suggestions.find((s) => s.binId === value)
    : undefined;

  const triggerLabel = selectedBin
    ? selectedBin.fullCode
    : selectedSuggestion
      ? selectedSuggestion.binFullCode
      : placeholder;

  const select = (binId: string) => {
    onChange(binId);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              "flex h-9 w-full min-w-[9rem] items-center justify-between gap-1.5 rounded-md border bg-white px-2.5 text-left font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:bg-zinc-100 dark:bg-zinc-900 dark:disabled:bg-zinc-800",
              value
                ? "border-zinc-300 text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400",
            )}
          >
            <span className="flex min-w-0 items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
              <span className="truncate">{triggerLabel}</span>
            </span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-0" sideOffset={4}>
          <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
            <div className="flex items-center border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
              <Search className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden />
              <CommandPrimitive.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Tìm vị trí…"
                className="flex-1 bg-transparent px-2 py-0.5 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              />
            </div>
            <CommandPrimitive.List className="max-h-[280px] overflow-y-auto p-1">
              <CommandPrimitive.Item
                key="__none__"
                value="__none__ chưa gán"
                onSelect={() => select("")}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-zinc-500 aria-selected:bg-zinc-100 dark:text-zinc-400 dark:aria-selected:bg-zinc-800"
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", !value ? "text-indigo-600 dark:text-indigo-400" : "text-transparent")} />
                {placeholder}
              </CommandPrimitive.Item>

              {loadError ? (
                <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                  Không tải được gợi ý — vẫn chọn được vị trí bên dưới.
                </div>
              ) : null}

              {filteredSuggestions.length > 0 ? (
                <CommandPrimitive.Group
                  heading="Gợi ý"
                  className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 [&_[cmdk-group-items]]:mt-1 [&_[cmdk-group-items]]:text-zinc-900 dark:text-zinc-500"
                >
                  {filteredSuggestions.map((s, idx) => (
                    <CommandPrimitive.Item
                      key={s.binId}
                      value={`${s.binFullCode} ${s.reason}`}
                      onSelect={() => select(s.binId)}
                      className="flex cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-indigo-50 dark:aria-selected:bg-indigo-950/40"
                    >
                      <span className="flex items-center gap-1.5">
                        <Check
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            value === s.binId
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-transparent",
                          )}
                        />
                        {idx === 0 ? (
                          <Sparkles className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                        ) : null}
                        <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {s.binFullCode}
                        </span>
                        {s.reasonCode === "STAGING_FALLBACK" ? (
                          <span className="ml-auto shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/40 dark:text-sky-400">
                            mặc định
                          </span>
                        ) : null}
                      </span>
                      <span className="pl-5 text-xs text-zinc-500 dark:text-zinc-400">
                        {s.reason}
                      </span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ) : null}

              {grouped.length > 0 ? (
                <CommandPrimitive.Group
                  heading="Chọn khác"
                  className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500"
                >
                  {grouped.map(([group, list]) => (
                    <div key={group}>
                      <div className="px-2 pt-2 text-[10px] font-semibold uppercase text-zinc-400 dark:text-zinc-500">
                        {group}
                      </div>
                      {list.map((b) => (
                        <CommandPrimitive.Item
                          key={b.id}
                          value={b.fullCode}
                          onSelect={() => select(b.id)}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
                        >
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              value === b.id ? "text-indigo-600 dark:text-indigo-400" : "text-transparent",
                            )}
                          />
                          <span className="font-mono text-xs">{b.fullCode}</span>
                        </CommandPrimitive.Item>
                      ))}
                    </div>
                  ))}
                </CommandPrimitive.Group>
              ) : null}

              {filteredSuggestions.length === 0 && grouped.length === 0 ? (
                <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  Không tìm thấy vị trí phù hợp.
                </CommandPrimitive.Empty>
              ) : null}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>
      {!value && hintWhenEmpty ? (
        <span className="text-xs font-medium text-sky-600 dark:text-sky-400">
          ⓘ {hintWhenEmpty}
        </span>
      ) : null}
    </div>
  );
}
