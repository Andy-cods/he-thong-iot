"use client";

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown, GripVertical, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MATERIALS, PROCESSES, PROCESS_MAP } from "./constants";

/* ─────────────────────────── Material combobox ─────────────────────────── */

interface MaterialComboboxProps {
  value: string;
  onChange: (code: string, name: string) => void;
}

export function MaterialCombobox({ value, onChange }: MaterialComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const current = MATERIALS.find((m) => m.code === value);
  const display = current
    ? `${current.code} — ${current.name}`
    : value
      ? value
      : "";

  const groups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? MATERIALS.filter(
          (m) =>
            m.code.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q),
        )
      : MATERIALS;
    const map = new Map<string, typeof MATERIALS>();
    for (const m of filtered) {
      if (!map.has(m.group)) map.set(m.group, []);
      map.get(m.group)!.push(m);
    }
    return Array.from(map.entries());
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-left text-[13px] transition-colors dark:border-zinc-700 dark:bg-zinc-900",
            "hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:hover:bg-zinc-800/60 dark:focus-visible:ring-indigo-600",
          )}
        >
          <span
            className={cn(
              "truncate",
              display ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500",
            )}
          >
            {display || "Chọn vật liệu…"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] p-0" sideOffset={4}>
        <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
          <div className="flex items-center border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <Search className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Tìm vật liệu theo mã / tên…"
              className="flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
          </div>
          <CommandPrimitive.List className="max-h-[320px] overflow-y-auto p-1">
            {groups.length === 0 ? (
              <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                Không tìm thấy vật liệu khớp "{query}".
              </CommandPrimitive.Empty>
            ) : (
              groups.map(([group, items]) => (
                <CommandPrimitive.Group
                  key={group}
                  heading={group}
                  className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-zinc-500 dark:[&_[cmdk-group-heading]]:text-zinc-400"
                >
                  {items.map((m) => (
                    <CommandPrimitive.Item
                      key={m.code}
                      value={`${m.code} ${m.name}`}
                      onSelect={() => {
                        onChange(m.code, m.name);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                        "aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          m.code === value
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-transparent",
                        )}
                      />
                      <span className="font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {m.code}
                      </span>
                      <span className="truncate text-zinc-700 dark:text-zinc-300">{m.name}</span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              ))
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────────────────── Process route builder ─────────────────────────── */

interface ProcessRouteBuilderProps {
  selected: string[];
  onAdd: (code: string) => void;
  onRemove: (code: string) => void;
  onMove: (code: string, dir: -1 | 1) => void;
}

export function ProcessRouteBuilder({
  selected,
  onAdd,
  onRemove,
  onMove,
}: ProcessRouteBuilderProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const available = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROCESSES.filter((p) => {
      if (selected.includes(p.code)) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    });
  }, [query, selected]);

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selected.length > 0 ? (
        <ol className="flex flex-wrap gap-1.5">
          {selected.map((code, idx) => {
            const proc = PROCESS_MAP.get(code);
            return (
              <li
                key={code}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 py-1 pl-1 pr-1 text-[12px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800"
              >
                <span className="inline-flex items-center gap-0.5 text-emerald-400 dark:text-emerald-500">
                  <GripVertical className="h-3 w-3" aria-hidden />
                  <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                    {idx + 1}
                  </span>
                </span>
                <span className="pl-0.5">{proc?.name ?? code}</span>
                <div className="ml-0.5 flex items-center">
                  <button
                    type="button"
                    onClick={() => onMove(code, -1)}
                    disabled={idx === 0}
                    className="rounded px-1 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300"
                    title="Chuyển lên trước"
                    aria-label="Chuyển lên trước"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(code, 1)}
                    disabled={idx === selected.length - 1}
                    className="rounded px-1 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300"
                    title="Chuyển xuống sau"
                    aria-label="Chuyển xuống sau"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(code)}
                    className="ml-0.5 rounded p-0.5 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-300"
                    title="Xoá công đoạn"
                    aria-label="Xoá công đoạn"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-[11px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          Chưa chọn công đoạn nào. Click "Thêm công đoạn" để bắt đầu.
        </p>
      )}

      {/* Add button + popover */}
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:focus-visible:ring-indigo-600"
            >
              + Thêm công đoạn
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[360px] p-0" sideOffset={4}>
            <CommandPrimitive
              shouldFilter={false}
              className="flex flex-col"
              loop
            >
              <div className="flex items-center border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
                <Search className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden />
                <CommandPrimitive.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Tìm công đoạn…"
                  className="flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-zinc-400 dark:text-zinc-50 dark:placeholder:text-zinc-500"
                />
              </div>
              <CommandPrimitive.List className="max-h-[280px] overflow-y-auto p-1">
                {available.length === 0 ? (
                  <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    {selected.length === PROCESSES.length
                      ? "Đã chọn đủ tất cả công đoạn."
                      : `Không tìm thấy "${query}".`}
                  </CommandPrimitive.Empty>
                ) : (
                  <CommandPrimitive.Group>
                    {available.map((p) => (
                      <CommandPrimitive.Item
                        key={p.code}
                        value={`${p.code} ${p.name}`}
                        onSelect={() => {
                          onAdd(p.code);
                          setQuery("");
                        }}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                          "aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800",
                        )}
                      >
                        <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {p.code}
                        </span>
                        <span className="truncate text-zinc-700 dark:text-zinc-300">{p.name}</span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}
              </CommandPrimitive.List>
            </CommandPrimitive>
          </PopoverContent>
        </Popover>
        <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
          {selected.length} công đoạn
        </span>
      </div>
    </div>
  );
}
