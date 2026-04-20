"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { BOM_STATUS_LABELS, type BomStatus } from "@iot/shared";
import { useBomDetail } from "@/hooks/useBom";
import { useSession } from "@/hooks/useSession";
import { ContextualSidebar } from "@/components/layout/ContextualSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import type { BadgeStatus } from "@/components/domain/StatusBadge";
import type { Role } from "@iot/shared";

/**
 * BOM Workspace Layout (V1.6) — render ContextualSidebar bên trái + children bên phải.
 *
 * Đây là nested layout nằm trong (app) layout. AppShell tự detect pathname
 * `/bom/[id]/*` để thu gọn global sidebar thành icon-only (56px), để không
 * gian cho ContextualSidebar (220px) tại đây.
 *
 * Các sub-route KHÔNG dùng workspace (new, import) được loại qua
 * matchBomWorkspace() trong AppShell.
 */
export default function BomWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? null;
  const detailQuery = useBomDetail(bomId);
  const sessionQuery = useSession();

  const template = detailQuery.data?.data?.template;

  // BOM mới/import/không hợp lệ: không render sidebar (fallback render children
  // như trang bình thường). AppShell cũng xử lý riêng cho đường dẫn như vậy.
  if (bomId === "new" || bomId === "import") {
    return <>{children}</>;
  }

  if (detailQuery.isLoading || !template) {
    return (
      <div className="flex h-full">
        <aside className="w-[220px] shrink-0 border-r border-zinc-200 bg-white p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-5 w-36" />
          <Skeleton className="mt-1 h-4 w-20" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </aside>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    );
  }

  if (detailQuery.isError) {
    return <>{children}</>;
  }

  const badge = bomStatusToBadge(template.status);
  const userRoles: Role[] | undefined = sessionQuery.data?.roles;

  return (
    <div className="flex h-full min-h-[calc(100vh-var(--topbar-height,44px))]">
      {/* Contextual sidebar */}
      <div className="hidden md:flex">
        <ContextualSidebar
          bomId={template.id}
          bomCode={template.code}
          bomName={template.name}
          bomStatus={badge.badgeStatus}
          bomStatusLabel={badge.label}
          userRoles={userRoles}
        />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        {children}
      </div>
    </div>
  );
}

function bomStatusToBadge(status: BomStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  switch (status) {
    case "ACTIVE":
      return { badgeStatus: "success", label: BOM_STATUS_LABELS.ACTIVE };
    case "DRAFT":
      return { badgeStatus: "draft", label: BOM_STATUS_LABELS.DRAFT };
    case "OBSOLETE":
      return { badgeStatus: "inactive", label: BOM_STATUS_LABELS.OBSOLETE };
  }
}
