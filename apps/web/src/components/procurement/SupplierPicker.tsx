"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSuppliersList } from "@/hooks/useSuppliers";
import { cn } from "@/lib/utils";

export interface SupplierPickerValue {
  id: string;
  code: string;
  name: string;
  region?: string | null;
  paymentTerms?: string | null;
  taxCode?: string | null;
}

export interface SupplierPickerProps {
  value: SupplierPickerValue | null;
  onChange: (v: SupplierPickerValue | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  id?: string;
}

/**
 * V1.9-P9 — SupplierPicker combobox với search theo name/code.
 * Khi chọn, return object đủ info để form auto-fill payment terms, region…
 */
export function SupplierPicker({
  value,
  onChange,
  placeholder = "Chọn nhà cung cấp...",
  allowClear = true,
  disabled,
  id,
}: SupplierPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const query = useSuppliersList({
    q: debouncedQ || undefined,
    pageSize: 20,
    isActive: true,
    sort: "name",
  });

  const rows = query.data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 transition-colors",
            "hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-0",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-sm text-zinc-500">
                {value.code}
              </span>
              <span className="truncate text-zinc-900">{value.name}</span>
            </span>
          ) : (
            <span className="text-zinc-400">{placeholder}</span>
          )}
          <span className="flex items-center gap-1">
            {value && allowClear && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Xoá lựa chọn"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
            <ChevronDown
              className="h-3.5 w-3.5 text-zinc-500"
              aria-hidden="true"
            />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="border-b border-zinc-100 p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <Input
              size="sm"
              autoFocus
              placeholder="Tìm tên NCC hoặc mã..."
              className="h-8 w-full pl-7"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <ul className="max-h-72 overflow-auto p-1" role="listbox">
          {query.isLoading && rows.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-zinc-500">
              Đang tải...
            </li>
          )}
          {!query.isLoading && rows.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-zinc-500">
              Không có kết quả
            </li>
          )}
          {rows.map((r) => {
            const selected = value?.id === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange({
                      id: r.id,
                      code: r.code,
                      name: r.name,
                      region: r.region ?? null,
                      paymentTerms: r.paymentTerms ?? null,
                      taxCode: r.taxCode ?? null,
                    });
                    setOpen(false);
                    setQ("");
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-base transition-colors hover:bg-zinc-100",
                    selected && "bg-indigo-50",
                  )}
                >
                  <span className="mt-0.5 w-20 shrink-0 truncate font-mono text-xs text-zinc-500">
                    {r.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-zinc-900">
                      {r.name}
                    </span>
                    {(r.region || r.paymentTerms) && (
                      <span className="block truncate text-xs text-zinc-500">
                        {[r.region, r.paymentTerms].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <Check
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-indigo-600"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
