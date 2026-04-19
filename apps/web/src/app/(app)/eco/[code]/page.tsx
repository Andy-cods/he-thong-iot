"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  GitBranch,
  Send,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AffectedOrdersPreview } from "@/components/eco/AffectedOrdersPreview";
import {
  EcoLineEditor,
  type EcoLineDraft,
} from "@/components/eco/EcoLineEditor";
import { useSession } from "@/hooks/useSession";
import {
  ACTION_LABEL,
  STATUS_LABEL,
  STATUS_VARIANTS,
  useApplyEco,
  useApproveEco,
  useEcoDetail,
  useRejectEco,
  useSubmitEco,
  type EcoLineAction,
} from "@/hooks/useEco";

export default function EcoDetailPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const session = useSession();
  const code = params.code;

  const query = useEcoDetail(code);
  const submitMut = useSubmitEco(code);
  const approveMut = useApproveEco(code);
  const rejectMut = useRejectEco(code);
  const applyMut = useApplyEco(code);

  const eco = query.data?.data;
  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isPlanner = roles.includes("admin") || roles.includes("planner");

  const onSubmit = async () => {
    try {
      await submitMut.mutateAsync({});
      toast.success("ECO đã submit chờ duyệt.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const onApprove = async () => {
    if (!confirm("Approve ECO? Sẽ clone revision DRAFT mới.")) return;
    try {
      await approveMut.mutateAsync({});
      toast.success("ECO đã approved + revision cloned.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const onReject = async () => {
    const reason = prompt("Lý do từ chối:") ?? "";
    if (!reason) return;
    try {
      await rejectMut.mutateAsync({ reason });
      toast.success("ECO rejected.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const onApply = async () => {
    if (
      !confirm(
        "Apply ECO? Revision cũ sẽ bị SUPERSEDED, mới → RELEASED. Không undo.",
      )
    )
      return;
    try {
      const res = await applyMut.mutateAsync({});
      const payload = res.data as unknown as {
        affectedOrdersCount?: number;
        syncMode?: boolean;
      };
      toast.success(
        `ECO applied (${payload.syncMode ? "sync" : "async"}) — ${payload.affectedOrdersCount ?? 0} orders affected.`,
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (query.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!eco) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Không tìm thấy ECO.</p>
        <Button
          className="mt-2"
          variant="ghost"
          size="sm"
          onClick={() => router.push("/eco")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Quay lại
        </Button>
      </div>
    );
  }

  const readonlyLines = eco.status !== "DRAFT";
  const draftLines: EcoLineDraft[] = eco.lines.map((l) => ({
    key: l.id,
    action: l.action as EcoLineAction,
    targetLineId: l.targetLineId,
    componentItemId: l.componentItemId,
    qtyPerParent: l.qtyPerParent !== null ? Number(l.qtyPerParent) : null,
    scrapPercent:
      l.scrapPercent !== null ? Number(l.scrapPercent) : null,
    description: l.description,
  }));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/eco")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Quay lại
          </Button>
          <div>
            <h1 className="font-mono text-lg font-semibold tracking-tight text-zinc-900">
              <GitBranch className="mr-1 inline-block h-5 w-5 text-zinc-500" />
              {eco.code}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <Badge variant={STATUS_VARIANTS[eco.status]}>
                {STATUS_LABEL[eco.status]}
              </Badge>
              <span>·</span>
              <span>Template: {eco.templateCode ?? "—"}</span>
              <span>·</span>
              <span>{eco.title}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {eco.status === "DRAFT" && isPlanner && (
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={submitMut.isPending}
            >
              <Send className="h-3.5 w-3.5" />
              Gửi duyệt
            </Button>
          )}
          {eco.status === "SUBMITTED" && isAdmin && (
            <>
              <Button
                size="sm"
                onClick={onApprove}
                disabled={approveMut.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Duyệt
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={onReject}
                disabled={rejectMut.isPending}
              >
                <XCircle className="h-3.5 w-3.5" />
                Từ chối
              </Button>
            </>
          )}
          {eco.status === "APPROVED" && isAdmin && (
            <Button
              size="sm"
              onClick={onApply}
              disabled={applyMut.isPending}
            >
              <Zap className="h-3.5 w-3.5" />
              Áp dụng
            </Button>
          )}
        </div>
      </header>

      <Tabs defaultValue="info" className="flex-1 overflow-hidden">
        <TabsList className="mx-6 mt-3">
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="lines">
            Thay đổi ({eco.lines.length})
          </TabsTrigger>
          <TabsTrigger value="affected">
            Đơn hàng ({eco.affectedOrdersCount})
          </TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="overflow-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoCard label="Tiêu đề" value={eco.title} />
            <InfoCard
              label="Template ảnh hưởng"
              value={eco.templateCode ?? "—"}
            />
            <InfoCard
              label="Submitted at"
              value={
                eco.submittedAt
                  ? new Date(eco.submittedAt).toLocaleString("vi-VN")
                  : "—"
              }
            />
            <InfoCard
              label="Approved at"
              value={
                eco.approvedAt
                  ? new Date(eco.approvedAt).toLocaleString("vi-VN")
                  : "—"
              }
            />
            <InfoCard
              label="Applied at"
              value={
                eco.appliedAt
                  ? new Date(eco.appliedAt).toLocaleString("vi-VN")
                  : "—"
              }
            />
            <InfoCard
              label="Apply progress"
              value={`${eco.applyProgress}%`}
            />
          </div>
          {eco.description && (
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-semibold text-zinc-500">
                Mô tả
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">
                {eco.description}
              </div>
            </div>
          )}
          {eco.rejectedReason && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3">
              <div className="text-xs font-semibold text-red-700">
                Lý do từ chối
              </div>
              <div className="mt-1 text-sm text-red-900">
                {eco.rejectedReason}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="lines" className="overflow-auto px-6 py-4">
          {readonlyLines ? (
            <div className="space-y-3">
              {eco.lines.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  ECO này không có line changes.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Loại</th>
                        <th className="px-3 py-2 text-left">Target line</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Scrap</th>
                        <th className="px-3 py-2 text-left">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {eco.lines.map((l, i) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2">{i + 1}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">
                              {ACTION_LABEL[l.action as EcoLineAction]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-zinc-600">
                            {l.targetLineId
                              ? l.targetLineId.slice(0, 8)
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.qtyPerParent ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.scrapPercent ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-zinc-600">
                            {l.description ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <EcoLineEditor lines={draftLines} onChange={() => undefined} readonly />
          )}
        </TabsContent>

        <TabsContent value="affected" className="overflow-auto px-6 py-4">
          <AffectedOrdersPreview code={eco.code} />
        </TabsContent>

        <TabsContent value="audit" className="overflow-auto px-6 py-4">
          <p className="text-sm text-zinc-500">
            Audit log — xem tại{" "}
            <code>/admin/audit?objectType=eco_change&amp;objectId={eco.id}</code>
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="mt-1 text-sm tabular-nums text-zinc-900">{value}</div>
    </div>
  );
}
