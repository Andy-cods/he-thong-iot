"use client";

import * as React from "react";
import type { SupplierCreate } from "@iot/shared";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeaderNav,
} from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SupplierForm, type SupplierFormProps } from "./SupplierForm";

/**
 * V4.4 (N6) — Sheet chuẩn cho tạo/sửa nhà cung cấp, thay "full-page" (tạo)
 * và "expand inline" (sửa) trước đây — 2 shell khác nhau cho CÙNG 1
 * `SupplierForm` (xem UI_INVENTORY.md mục "suppliers-new dùng FULL-PAGE thay
 * Sheet" + C.I "inline-edit là ngôn ngữ overlay thứ 3"). Nút xác nhận nằm ở
 * `SheetHeaderNav` (luôn hiện, không cần cuộn hết form dài 15+ trường), ghi
 * rõ việc sẽ làm ("Tạo nhà cung cấp" / "Lưu thay đổi").
 *
 * V4.4 (bổ sung chủ xưởng) — cảnh báo mất dữ liệu khi đóng Sheet (Huỷ/Esc/
 * click nền) lúc form đang có thay đổi CHƯA lưu; đóng êm (không hỏi) khi
 * form sạch hoặc khi đóng do `onSubmit` đã lưu thành công (caller tự gọi
 * `onOpenChange(false)` trực tiếp, không qua `requestClose` nên không bị hỏi lại).
 */

const FORM_ID = "supplier-form";

export interface SupplierFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  defaultValues?: SupplierFormProps["defaultValues"];
  submitting?: boolean;
  onSubmit: (data: SupplierCreate) => Promise<void> | void;
}

export function SupplierFormSheet({
  open,
  onOpenChange,
  mode,
  defaultValues,
  submitting,
  onSubmit,
}: SupplierFormSheetProps) {
  const askConfirm = useConfirm();
  const dirtyRef = React.useRef(false);

  // Reset cờ "đã sửa" mỗi lần Sheet mở lại (tránh dính trạng thái phiên trước).
  React.useEffect(() => {
    if (open) dirtyRef.current = false;
  }, [open]);

  const requestClose = () => {
    if (!dirtyRef.current) {
      onOpenChange(false);
      return;
    }
    void askConfirm({
      title: "Đóng mà không lưu?",
      description: "Thông tin vừa nhập sẽ bị mất.",
      confirmLabel: "Đóng, không lưu",
      cancelLabel: "Tiếp tục nhập",
      tone: "danger",
    }).then((ok) => {
      if (ok) onOpenChange(false);
    });
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <SheetContent side="right" size="lg" hideCloseButton className="flex flex-col">
        <SheetHeaderNav
          title={mode === "create" ? "Thêm nhà cung cấp" : "Chỉnh sửa nhà cung cấp"}
          onCancel={requestClose}
          action={{
            label: submitting
              ? "Đang lưu…"
              : mode === "create"
                ? "Tạo nhà cung cấp"
                : "Lưu thay đổi",
            type: "submit",
            form: FORM_ID,
            disabled: submitting,
          }}
        />
        <SheetBody>
          {mode === "create" ? (
            <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
              Nhập thông tin cơ bản. Danh sách vật tư cung cấp gắn sau trong
              trang chi tiết.
            </p>
          ) : null}
          <SupplierForm
            formId={FORM_ID}
            defaultValues={defaultValues}
            onSubmit={onSubmit}
            onDirtyChange={(d) => {
              dirtyRef.current = d;
            }}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
