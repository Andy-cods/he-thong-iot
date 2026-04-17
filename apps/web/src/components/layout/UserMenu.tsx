"use client";

import * as React from "react";
import { ChevronDown, LogOut, Settings as SettingsIcon, User } from "lucide-react";
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
 * Direction B — UserMenu (design-spec §3.5).
 * Avatar + username + role badge → Radix DropdownMenu.
 * Item Logout ở cuối với variant danger.
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
          "inline-flex h-10 items-center gap-2 rounded px-2 text-sm text-slate-700 transition-colors hover:bg-slate-100",
          "focus:outline-none focus-visible:shadow-focus",
          className,
        )}
        aria-label="Tài khoản người dùng"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
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
        <span className="hidden max-w-[140px] truncate md:inline">
          {user.fullName || user.username}
        </span>
        <ChevronDown
          className="h-4 w-4 text-slate-500"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-slate-900">
              {user.fullName || user.username}
            </div>
            <div className="text-xs text-slate-600">@{user.username}</div>
            <div className="text-xs text-slate-500">
              Vai trò:{" "}
              <span className="font-medium text-slate-700">{roleLabel}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Hồ sơ</span>
          <span className="ml-auto text-xs text-slate-400">V1.1</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Cài đặt</span>
          <span className="ml-auto text-xs text-slate-400">V1.1</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="normal-case tracking-normal text-slate-500">
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
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
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
