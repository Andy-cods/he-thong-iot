"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, GitBranch, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EcoLineEditor,
  type EcoLineDraft,
} from "@/components/eco/EcoLineEditor";
import { useBomList } from "@/hooks/useBom";
import { useCreateEco } from "@/hooks/useEco";

export default function EcoNewPage() {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [affectedTemplateId, setAffectedTemplateId] = React.useState<string>("");
  const [oldRevisionId, setOldRevisionId] = React.useState<string>("");
  const [lines, setLines] = React.useState<EcoLineDraft[]>([]);

  const bomQuery = useBomList({ page: 1, pageSize: 200 });
  const templates = bomQuery.data?.data ?? [];

  const [revisions, setRevisions] = React.useState<
    Array<{ id: string; revisionNo: string; status: string }>
  >([]);

  React.useEffect(() => {
    if (!affectedTemplateId) {
      setRevisions([]);
      setOldRevisionId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/bom/revisions?templateId=${affectedTemplateId}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          data: Array<{ id: string; revisionNo: string; status: string }>;
        };
        if (!cancelled) setRevisions(body.data ?? []);
      } catch {
        // ignore — user có thể bỏ qua oldRevisionId (ECO không gắn revision)
        if (!cancelled) setRevisions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [affectedTemplateId]);

  const createMut = useCreateEco();

  const canSubmit = title.trim().length > 0 && affectedTemplateId.length > 0;

  const onSubmit = async () => {
    if (!canSubmit) return;
    try {
      const eco = await createMut.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        affectedTemplateId,
        oldRevisionId: oldRevisionId || null,
        lines: lines.map((l) => ({
          action: l.action,
          targetLineId: l.targetLineId,
          componentItemId: l.componentItemId,
          qtyPerParent: l.qtyPerParent,
          scrapPercent: l.scrapPercent,
          description: l.description,
        })),
      });
      toast.success(`Đã tạo ECO ${eco.data.code}`);
      router.push(`/eco/${eco.data.code}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

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
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            <GitBranch className="mr-1 inline-block h-5 w-5 text-zinc-500" />
            Tạo ECO mới
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={!canSubmit || createMut.isPending}
          >
            <Save className="h-3.5 w-3.5" />
            Lưu nháp
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Thông tin chung
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="eco-title" uppercase required>
                  Tiêu đề
                </Label>
                <Input
                  id="eco-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="VD: Đổi scrap 5% → 3% component A"
                  maxLength={256}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eco-desc" uppercase>
                  Mô tả / lý do
                </Label>
                <Textarea
                  id="eco-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả chi tiết lý do cần thay đổi BOM"
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              BOM Template ảnh hưởng
            </h2>
            {bomQuery.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label uppercase required>
                    Template
                  </Label>
                  <Select
                    value={affectedTemplateId}
                    onValueChange={setAffectedTemplateId}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Chọn BOM template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="font-mono text-xs">{t.code}</span>{" "}
                          — {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label uppercase>Old revision</Label>
                  <Select
                    value={oldRevisionId}
                    onValueChange={setOldRevisionId}
                    disabled={revisions.length === 0}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={
                          revisions.length === 0
                            ? "Chọn template trước"
                            : "Chọn revision…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {revisions.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.revisionNo} ({r.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Danh sách thay đổi ({lines.length})
            </h2>
            <EcoLineEditor lines={lines} onChange={setLines} />
          </section>
        </div>
      </div>
    </div>
  );
}
