"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useBomLineWoImpact, useUpdateBomLine } from "@/hooks/useBom";
import { buildBomEditWoWarning } from "@/lib/bom-wo-warning";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import {
  buildInitial,
  buildSavePayload,
  buildWorkOrderHref,
  validateForm,
  type FormErrors,
  type FormState,
} from "./model";

/** Trạng thái form + lưu của BomLineSheet (xem trước ↔ sửa, expectedVersion, 409). */
export function useLineSheetForm({
  open,
  line,
  templateId,
  templateCode,
  onOpenChange,
}: {
  open: boolean;
  line: BomFlatRow | null;
  templateId: string;
  templateCode: string;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const mutation = useUpdateBomLine(templateId);
  const askConfirm = useConfirm();
  // Cảnh báo nếu có lệnh SX chưa xong đang dùng dòng này (hỏi lại trước khi lưu).
  const woImpact = useBomLineWoImpact(templateId, open ? (line?.id ?? null) : null);

  const [form, setForm] = React.useState<FormState>(() => buildInitial(line?.node ?? null));
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [editing, setEditing] = React.useState(false);
  // row_version mới nhất: SupplierCell lưu ngay nên phải theo dõi cục bộ để Lưu không 409 oan.
  const [liveVersion, setLiveVersion] = React.useState<number>(line?.node.rowVersion ?? 1);

  React.useEffect(() => {
    if (open && line) {
      setForm(buildInitial(line.node));
      setErrors({});
      setEditing(false);
      setLiveVersion(line.node.rowVersion ?? 1);
    }
  }, [open, line]);

  const setField = React.useCallback(
    <K extends keyof FormState>(k: K, v: FormState[K]) => {
      setForm((prev) => ({ ...prev, [k]: v }));
      setErrors((prev) => (prev[k] ? { ...prev, [k]: undefined } : prev));
    },
    [],
  );

  const cancelEdit = React.useCallback(() => {
    if (line) setForm(buildInitial(line.node));
    setErrors({});
    setEditing(false);
  }, [line]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!line) return;
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const warning = buildBomEditWoWarning(woImpact.data?.data ?? { count: 0, wos: [] });
    if (warning) {
      const ok = await askConfirm({
        title: "Đang có lệnh SX dùng BOM này",
        description: warning,
        confirmLabel: "Vẫn lưu",
      });
      if (!ok) return;
    }
    try {
      await mutation.mutateAsync({
        lineId: line.id,
        data: { ...buildSavePayload(form, line.node), expectedVersion: liveVersion },
      });
      toast.success("Đã lưu thay đổi");
      onOpenChange(false);
    } catch (err) {
      const er = err as Error & { status?: number; code?: string };
      if (er.status === 409 && er.code === "VERSION_CONFLICT") {
        toast.error("Dòng này vừa được người khác sửa — đã tải lại, kiểm tra rồi lưu lại.");
        onOpenChange(false);
        return;
      }
      toast.error(er.message ?? "Không cập nhật được linh kiện");
    }
  };

  /** Tạo Lệnh SX từ dữ liệu đã lưu của dòng (không cần lưu form). */
  const createWorkOrder = () => {
    if (!line) return;
    router.push(
      buildWorkOrderHref(buildInitial(line.node), line.node, line.id, templateId, templateCode),
    );
  };

  return {
    form,
    errors,
    editing,
    setEditing,
    setField,
    cancelEdit,
    submit,
    pending: mutation.isPending,
    liveVersion,
    setLiveVersion,
    createWorkOrder,
  };
}
