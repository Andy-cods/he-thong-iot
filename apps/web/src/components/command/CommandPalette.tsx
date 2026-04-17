"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import {
  Clock,
  Factory,
  LayoutDashboard,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { useHotkey, formatShortcut } from "@/lib/shortcuts";
import { storage, STORAGE_KEYS } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Direction B — CommandPalette (design-spec §3.4).
 *
 * - cmdk lib, mở với Ctrl+K / Cmd+K (Mod+K) global.
 * - Groups: Điều hướng, Gần đây, Hành động. (Vật tư server-search để screen phase.)
 * - Recent items localStorage `iot:cmdk-recent`, expire 30 ngày.
 * - Permission-gated: ẩn item không đúng role.
 * - Empty state "Không có kết quả".
 */

type Role = "admin" | "planner" | "warehouse" | "viewer";

export interface CommandItemDef {
  id: string;
  label: string;
  href?: string;
  action?: () => void;
  icon?: React.ElementType;
  shortcut?: string;
  group: "nav" | "action";
  roles?: Role[];
}

const DEFAULT_ITEMS: CommandItemDef[] = [
  {
    id: "nav:dashboard",
    label: "Tổng quan",
    href: "/",
    icon: LayoutDashboard,
    group: "nav",
    shortcut: "G D",
    roles: ["admin", "planner", "viewer"],
  },
  {
    id: "nav:items",
    label: "Vật tư",
    href: "/items",
    icon: Package,
    group: "nav",
    shortcut: "G I",
    roles: ["admin", "planner", "warehouse", "viewer"],
  },
  {
    id: "nav:suppliers",
    label: "Nhà cung cấp",
    href: "/suppliers",
    icon: ShoppingCart,
    group: "nav",
    shortcut: "G S",
    roles: ["admin", "planner"],
  },
  {
    id: "nav:receive",
    label: "Nhận hàng (PWA)",
    href: "/pwa/receive",
    icon: Truck,
    group: "nav",
    roles: ["admin", "warehouse"],
  },
  {
    id: "nav:admin",
    label: "Quản trị",
    href: "/admin",
    icon: Settings,
    group: "nav",
    roles: ["admin"],
  },
  {
    id: "action:item-new",
    label: "Thêm vật tư mới",
    href: "/items/new",
    icon: Plus,
    group: "action",
    shortcut: "N I",
    roles: ["admin", "planner"],
  },
  {
    id: "action:wo-new",
    label: "Tạo Work Order (V1.1)",
    icon: Factory,
    group: "action",
    roles: ["admin", "planner"],
    action: () => {
      /* disabled V1 */
    },
  },
];

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items?: CommandItemDef[];
  userRole?: Role;
}

interface RecentEntry {
  id: string;
  label: string;
  href?: string;
  at: number;
}

const RECENT_TTL_DAYS = 30;
const RECENT_MAX = 5;

export function CommandPalette({
  open,
  onOpenChange,
  items = DEFAULT_ITEMS,
  userRole,
}: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [recents, setRecents] = React.useState<RecentEntry[]>([]);

  // Global Ctrl+K / Cmd+K — toggle open.
  useHotkey(
    "Mod+k",
    () => onOpenChange(!open),
    { allowInInput: true, enabled: true },
  );

  // Load recents khi mở.
  React.useEffect(() => {
    if (!open) return;
    const now = Date.now();
    const expireMs = RECENT_TTL_DAYS * 24 * 60 * 60 * 1000;
    const loaded = storage.get<RecentEntry[]>(STORAGE_KEYS.cmdkRecents, []);
    const valid = loaded.filter((e) => now - e.at < expireMs);
    setRecents(valid);
  }, [open]);

  // Reset query khi đóng.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const visibleItems = React.useMemo(() => {
    if (!userRole) return items;
    return items.filter((it) => !it.roles || it.roles.includes(userRole));
  }, [items, userRole]);

  const navItems = visibleItems.filter((it) => it.group === "nav");
  const actionItems = visibleItems.filter((it) => it.group === "action");

  const runItem = React.useCallback(
    (item: CommandItemDef) => {
      // Update recents
      const entry: RecentEntry = {
        id: item.id,
        label: item.label,
        href: item.href,
        at: Date.now(),
      };
      const next = [entry, ...recents.filter((e) => e.id !== item.id)].slice(
        0,
        RECENT_MAX,
      );
      setRecents(next);
      storage.set(STORAGE_KEYS.cmdkRecents, next);

      onOpenChange(false);
      if (item.href) {
        router.push(item.href);
      } else if (item.action) {
        item.action();
      }
    },
    [onOpenChange, recents, router],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tìm kiếm và lệnh"
      className="fixed inset-0 z-cmdk flex items-start justify-center bg-overlay-scrim backdrop-blur-[2px] animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <CommandPrimitive
        label="Bảng lệnh"
        className="mt-[15vh] flex w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
        // cmdk handles arrow keys / enter / escape
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onOpenChange(false);
          }
        }}
      >
        <div className="flex h-11 items-center gap-2 border-b border-zinc-200 px-3">
          <Search
            className="h-4 w-4 shrink-0 text-zinc-400"
            aria-hidden="true"
          />
          <CommandPrimitive.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Tìm kiếm hoặc gõ lệnh..."
            className="h-full flex-1 bg-transparent text-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          <kbd className="rounded-sm border border-zinc-200 bg-zinc-50 px-1.5 py-0 font-mono text-[10px] text-zinc-500">
            Esc
          </kbd>
        </div>
        <CommandPrimitive.List className="max-h-[400px] overflow-y-auto py-1">
          <CommandPrimitive.Empty className="px-4 py-8 text-center text-sm text-zinc-500">
            Không có kết quả.
          </CommandPrimitive.Empty>

          {recents.length > 0 ? (
            <CommandPrimitive.Group
              heading="Gần đây"
              className="text-xs font-medium uppercase tracking-wider text-zinc-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
            >
              {/* Limit recent items to 5 max (V2 spec §3.1.6) */}
              {recents.slice(0, RECENT_MAX).map((r) => (
                <CommandRow
                  key={r.id}
                  icon={Clock}
                  label={r.label}
                  onSelect={() => {
                    const match = items.find((it) => it.id === r.id);
                    if (match) runItem(match);
                  }}
                />
              ))}
            </CommandPrimitive.Group>
          ) : null}

          <CommandPrimitive.Group
            heading="Điều hướng"
            className="text-xs font-medium uppercase tracking-wider text-zinc-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
          >
            {navItems.map((it) => (
              <CommandRow
                key={it.id}
                icon={it.icon ?? Search}
                label={it.label}
                shortcut={it.shortcut}
                onSelect={() => runItem(it)}
              />
            ))}
          </CommandPrimitive.Group>

          {actionItems.length > 0 ? (
            <CommandPrimitive.Group
              heading="Hành động"
              className="text-xs font-medium uppercase tracking-wider text-zinc-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5"
            >
              {actionItems.map((it) => (
                <CommandRow
                  key={it.id}
                  icon={it.icon ?? Plus}
                  label={it.label}
                  shortcut={it.shortcut}
                  onSelect={() => runItem(it)}
                />
              ))}
            </CommandPrimitive.Group>
          ) : null}
        </CommandPrimitive.List>
        {/* V2 footer hints — consistent với Linear CmdK */}
        <div className="flex h-8 items-center gap-3 border-t border-zinc-100 px-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-sm border border-zinc-200 bg-zinc-50 px-1 font-mono text-[10px]">
              ↑↓
            </kbd>
            Di chuyển
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-sm border border-zinc-200 bg-zinc-50 px-1 font-mono text-[10px]">
              ↵
            </kbd>
            Chọn
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded-sm border border-zinc-200 bg-zinc-50 px-1 font-mono text-[10px]">
              Esc
            </kbd>
            Đóng
          </span>
        </div>
      </CommandPrimitive>
    </div>
  );
}

function CommandRow({
  icon: Icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <CommandPrimitive.Item
      onSelect={onSelect}
      className={cn(
        "mx-1 flex h-8 items-center gap-2 rounded-sm px-3 text-base text-zinc-700",
        "aria-selected:bg-blue-50 aria-selected:text-blue-700 aria-selected:font-medium",
        "cursor-pointer transition-colors duration-100 ease-out",
      )}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-zinc-500 aria-selected:text-blue-600"
        aria-hidden="true"
        strokeWidth={1.75}
      />
      <span className="flex-1 truncate">{label}</span>
      {shortcut ? (
        <span className="font-mono text-[10px] text-zinc-400">{shortcut}</span>
      ) : null}
    </CommandPrimitive.Item>
  );
}

export { formatShortcut as formatCommandShortcut };
