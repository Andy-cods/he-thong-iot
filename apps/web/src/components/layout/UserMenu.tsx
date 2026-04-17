"use client";

import * as React from "react";
import {
  ChevronDown,
  LogOut,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * V2 UserMenu — Linear-inspired compact.
 * Trigger h-8 avatar 24px. Menu items h-8 text-base (13px).
 * Logout variant danger red-700 focus bg-red-50.
 */

export interface UserMenuUser {
  id: string;
  username: string;
  fullName?: string;
  role: string;
  avatarUrl?: string;
}

export interface UserMenuProps {
  user: UserMenuUser;
  onLogout: () => void | Promise<void>;
  version?: string;
  className?: string;
}

export function UserMenu({
  user,
  onLogout,
  version = "1.0.0",
  className,
}: UserMenuProps) {
  const [loading, setLoading] = React.useState(false);
  const initials = getInitials(user.fullName || user.username);
  const roleLabel = ROLE_LABEL[user.role] ?? user.role;

  const handleLogout = async () => {
    setLoading(true);
    try {
      await onLogout();
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-base text-zinc-700 transition-colors duration-100",
          "hover:bg-zinc-100",
          "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
          className,
        )}
        aria-label="Tài khoản người dùng"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700"
        >
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <span className="hidden max-w-[120px] truncate font-medium md:inline">
          {user.fullName || user.username}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 text-zinc-400"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <div className="space-y-0.5">
            <div className="text-base font-semibold text-zinc-900">
              {user.fullName || user.username}
            </div>
            <div className="text-sm text-zinc-500">@{user.username}</div>
            <div className="text-sm text-zinc-500">
              Vai trò:{" "}
              <span className="font-medium text-zinc-700">{roleLabel}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <span>Hồ sơ</span>
          <span className="ml-auto text-xs text-zinc-400">V1.1</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <SettingsIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <span>Cài đặt</span>
          <span className="ml-auto text-xs text-zinc-400">V1.1</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="normal-case tracking-normal text-zinc-400">
          Phiên bản {version}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="danger"
          onSelect={(e) => {
            e.preventDefault();
            void handleLogout();
          }}
          disabled={loading}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{loading ? "Đang đăng xuất..." : "Đăng xuất"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  planner: "Kế hoạch",
  warehouse: "Thủ kho",
  viewer: "Người xem",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
