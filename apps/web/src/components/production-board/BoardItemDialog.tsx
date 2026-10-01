"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetHeaderNav } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBoardItem,
  useCreateBoardItem,
  useUpdateBoardItem,
  type BoardItem,
  type BoardStatus,
} from "@/hooks/useProductionBoard";
import { useSession } from "@/hooks/useSession";
import {
  BOARD_QTY_MAX,
  BOARD_QTY_MAX_MESSAGE,
  BOARD_UNIT_PRICE_MAX,
  BOARD_UNIT_PRICE_MAX_MESSAGE,
  canSeeOrderValue,
} from "@/lib/production-board-policy";
import { formatMoney } from "@/lib/format";

/**
 * V3.8 — Sheet tạo/sửa mã hàng trên Bảng sản xuất (QC lead).
 *
 * V4.4 UI nhóm E (UI_INVENTORY.md §9 mục 2) — trước là Dialog `size="lg"` với
 * 12 trường, vi phạm N6 ("form nhiều trường phải dùng Sheet, không Dialog").
 * Chuyển sang Sheet bên phải + SheetHeaderNav + nhóm trường inset grouped
 * (tiêu đề nhóm qua `<Label uppercase>`), lỗi hiện ngay dưới trường thay vì
 * chỉ toast, cảnh báo khi đóng form đang có thay đổi chưa lưu — khớp chuẩn
 * chung form phiếu của hệ thống. KHÔNG đổi payload/logic gọi API.
 */

const STATUS_OPTIONS: Array<{ value: BoardStatus; label: string }> = [
  { value: "QUEUED", label: "Sắp gia công" },
  { value: "IN_PROGRESS", label: "Đang gia công" },
  { value: "QC", label: "Đang kiểm (QC)" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "DELIVERED", label: "Đã giao" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Có item → edit; không → create. */
  item?: BoardItem | null;
}

function emptyForm() {
  return {
    productCode: "",
    rfqNo: "",
    productName: "",
    customer: "",
    qtyPlanned: "0",
    qtyDone: "0",
    uom: "PCS",
    status: "QUEUED" as BoardStatus,
    deadline: "",
    currentStage: "",
    notes: "",
    isPinned: false,
    /** V4.4.2 — chuỗi để input tự do; "" = chưa nhập (khác "0"). */
    unitPrice: "",
  };
}

export function BoardItemDialog({ open, onOpenChange, item }: Props) {
  const isEdit = !!item;
  const createMut = useCreateBoardItem();
  const updateMut = useUpdateBoardItem();
  const session = useSession();
  // V4.4.2 — chỉ admin/kế toán/thu mua thấy + nhập đơn giá bán (hàm quyền
  // DUY NHẤT, dùng chung client/server — xem lib/production-board-policy.ts).
  const canSeePrice = canSeeOrderValue(session.data?.roles);

  // TASK-20261001 (việc 1) — danh sách (prop `item`, lấy từ GET list) KHÔNG
  // còn trả `unitPrice` cho bất kỳ vai nào → khi mở Sửa + vai được xem giá,
  // gọi API chi tiết để lấy `unitPrice` THẬT (tránh gửi PATCH với unitPrice
  // rỗng đè mất giá đã nhập trước đó).
  const detailQuery = useBoardItem(item?.id ?? null, { enabled: open && isEdit && canSeePrice });
  const detailItem = detailQuery.data?.data;

  const [form, setForm] = React.useState(emptyForm());
  const [isDirty, setIsDirty] = React.useState(false);
  const [warnOpen, setWarnOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<{
    productCode?: string;
    productName?: string;
    qtyPlanned?: string;
    qtyDone?: string;
    unitPrice?: string;
  }>({});
  const productCodeRef = React.useRef<HTMLInputElement>(null);
  const productNameRef = React.useRef<HTMLTextAreaElement>(null);

  // Reset form khi mở dialog / đổi item.
  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setIsDirty(false);
    if (item) {
      setForm({
        productCode: item.productCode,
        rfqNo: item.rfqNo ?? "",
        productName: item.productName,
        customer: item.customer ?? "",
        qtyPlanned: String(item.qtyPlanned ?? "0"),
        qtyDone: String(item.qtyDone ?? "0"),
        uom: item.uom ?? "PCS",
        status: item.status,
        deadline: item.deadline ? item.deadline.slice(0, 10) : "",
        currentStage: item.currentStage ?? "",
        notes: item.notes ?? "",
        isPinned: item.isPinned,
        // V4.4.2/TASK-20261001 — `item` (từ list) không còn mang `unitPrice`
        // thật; để trống ở đây, hiệu ứng dưới điền lại khi API chi tiết trả về.
        unitPrice: item.unitPrice == null ? "" : String(item.unitPrice),
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, item]);

  // TASK-20261001 (việc 1) — điền `unitPrice` THẬT khi API chi tiết trả về
  // (không đánh dấu dirty — đây là giá trị gốc, không phải người dùng sửa).
  React.useEffect(() => {
    if (!open || !isEdit || !canSeePrice || !detailItem) return;
    setForm((f) => ({
      ...f,
      unitPrice: detailItem.unitPrice == null ? "" : String(detailItem.unitPrice),
    }));
  }, [open, isEdit, canSeePrice, detailItem]);

  const set = <K extends keyof ReturnType<typeof emptyForm>>(
    k: K,
    v: ReturnType<typeof emptyForm>[K],
  ) => {
    setForm((f) => ({ ...f, [k]: v }));
    setIsDirty(true);
  };

  // Chặn Lưu khi đang tải `unitPrice` thật (tránh PATCH với ô giá còn rỗng
  // đè mất giá cũ — xem hiệu ứng điền `detailItem.unitPrice` ở trên).
  const priceLoading = isEdit && canSeePrice && detailQuery.isLoading;
  const busy = createMut.isPending || updateMut.isPending || priceLoading;

  const attemptClose = React.useCallback(() => {
    if (isDirty && !busy) {
      setWarnOpen(true);
    } else {
      onOpenChange(false);
    }
  }, [isDirty, busy, onOpenChange]);

  const handleSubmit = async () => {
    const nextErrors: typeof errors = {};
    if (!form.productCode.trim()) nextErrors.productCode = "Nhập mã hàng.";
    if (!form.productName.trim()) nextErrors.productName = "Nhập tên/spec sản phẩm.";
    // V4.5 QA-C P2-1/QA-D P1-01 — chặn giá/SL phi thực tế ngay ở client (server
    // vẫn kiểm lại — xem zod schema ở route production-board).
    if ((Number(form.qtyPlanned) || 0) > BOARD_QTY_MAX) nextErrors.qtyPlanned = BOARD_QTY_MAX_MESSAGE;
    if ((Number(form.qtyDone) || 0) > BOARD_QTY_MAX) nextErrors.qtyDone = BOARD_QTY_MAX_MESSAGE;
    if (canSeePrice && (Number(form.unitPrice) || 0) > BOARD_UNIT_PRICE_MAX) {
      nextErrors.unitPrice = BOARD_UNIT_PRICE_MAX_MESSAGE;
    }
    setErrors(nextErrors);
    if (nextErrors.productCode) {
      productCodeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      productCodeRef.current?.focus();
      return;
    }
    if (nextErrors.productName) {
      productNameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      productNameRef.current?.focus();
      return;
    }
    if (nextErrors.qtyPlanned || nextErrors.qtyDone || nextErrors.unitPrice) return;

    const payload = {
      productCode: form.productCode.trim(),
      rfqNo: form.rfqNo.trim() || null,
      productName: form.productName.trim(),
      customer: form.customer.trim() || null,
      qtyPlanned: Number(form.qtyPlanned) || 0,
      qtyDone: Number(form.qtyDone) || 0,
      uom: form.uom.trim() || "PCS",
      status: form.status,
      deadline: form.deadline || null,
      currentStage: form.currentStage.trim() || null,
      notes: form.notes.trim() || null,
      isPinned: form.isPinned,
      // V4.4.2 — chỉ gửi khi vai thấy ô này (ẩn với QC…) — server cũng tự lọc
      // nếu client vẫn gửi, nhưng không gửi là KISS hơn ở đây.
      ...(canSeePrice
        ? { unitPrice: form.unitPrice.trim() === "" ? null : Number(form.unitPrice) || 0 }
        : {}),
    };
    try {
      if (isEdit && item) {
        await updateMut.mutateAsync({ id: item.id, payload });
        toast.success(`Đã cập nhật ${payload.productCode}`);
      } else {
        await createMut.mutateAsync(payload);
        toast.success(`Đã thêm ${payload.productCode}`);
      }
      setIsDirty(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu");
    }
  };

  const actionLabel = busy
    ? "Đang lưu…"
    : isEdit
      ? "Lưu thay đổi"
      : "Thêm vào bảng";

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && attemptClose()}>
        <SheetContent
          side="right"
          size="lg"
          hideCloseButton
          onInteractOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setWarnOpen(true);
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              setWarnOpen(true);
            }
          }}
          className="flex flex-col"
        >
          <SheetHeaderNav
            title={isEdit ? "Sửa mã hàng" : "Thêm mã hàng vào bảng"}
            onCancel={attemptClose}
            action={{ label: actionLabel, onClick: () => void handleSubmit(), disabled: busy }}
          />
          <SheetBody>
            <div className="space-y-5">
              {/* Nhóm 1 — Thông tin sản phẩm */}
              <section className="space-y-3">
                <Label uppercase>Thông tin sản phẩm</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mã hàng (BQMS)" required className="col-span-2 sm:col-span-1">
                    <Input
                      ref={productCodeRef}
                      value={form.productCode}
                      onChange={(e) => set("productCode", e.target.value)}
                      placeholder="Z0000002-259491"
                      autoFocus
                      error={!!errors.productCode}
                    />
                    {errors.productCode && <FieldError>{errors.productCode}</FieldError>}
                  </Field>
                  <Field label="Mã RFQ" className="col-span-2 sm:col-span-1">
                    <Input
                      value={form.rfqNo}
                      onChange={(e) => set("rfqNo", e.target.value)}
                      placeholder="QT25052426"
                    />
                  </Field>
                  <Field label="Tên / Spec sản phẩm" required className="col-span-2">
                    <Textarea
                      ref={productNameRef}
                      value={form.productName}
                      onChange={(e) => set("productName", e.target.value)}
                      placeholder="BASE B_VINYL B ATTACH COMMON, L161xW66xH26 mm, PB108"
                      rows={2}
                      error={!!errors.productName}
                    />
                    {errors.productName && <FieldError>{errors.productName}</FieldError>}
                  </Field>
                  <Field label="Khách hàng" className="col-span-2 sm:col-span-1">
                    <Input
                      value={form.customer}
                      onChange={(e) => set("customer", e.target.value)}
                      placeholder="SEVT / SEV"
                    />
                  </Field>
                </div>
              </section>

              {/* Nhóm 2 — Tiến độ & đơn vị */}
              <section className="space-y-3">
                <Label uppercase>Tiến độ &amp; đơn vị</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Công đoạn hiện tại" className="col-span-2 sm:col-span-1">
                    <Input
                      value={form.currentStage}
                      onChange={(e) => set("currentStage", e.target.value)}
                      placeholder="CNC 02 / Đánh bóng…"
                    />
                  </Field>
                  <Field label="Trạng thái" className="col-span-2 sm:col-span-1">
                    <Select
                      value={form.status}
                      onValueChange={(v) => set("status", v as BoardStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="SL kế hoạch">
                    <QtyWithUom
                      value={form.qtyPlanned}
                      uom={form.uom}
                      onChange={(v) => set("qtyPlanned", v)}
                      max={BOARD_QTY_MAX}
                    />
                    {errors.qtyPlanned && <FieldError>{errors.qtyPlanned}</FieldError>}
                  </Field>
                  <Field label="SL đã đạt">
                    <QtyWithUom
                      value={form.qtyDone}
                      uom={form.uom}
                      onChange={(v) => set("qtyDone", v)}
                      max={BOARD_QTY_MAX}
                    />
                    {errors.qtyDone && <FieldError>{errors.qtyDone}</FieldError>}
                  </Field>
                  <Field label="ĐVT" className="col-span-2 sm:col-span-1">
                    <Input
                      value={form.uom}
                      onChange={(e) => set("uom", e.target.value.toUpperCase())}
                      placeholder="PCS / SET"
                      className="uppercase"
                    />
                  </Field>
                  <Field label="Hạn giao" className="col-span-2 sm:col-span-1">
                    <DateField value={form.deadline} onChange={(v) => set("deadline", v)} />
                  </Field>
                  {/* V4.4.2 — chỉ admin/kế toán/thu mua thấy + nhập đơn giá bán
                      (canSeeOrderValue) — QC/kho/vận hành/cổ đông KHÔNG thấy ô này. */}
                  {canSeePrice && (
                    <>
                      <Field label="Đơn giá bán (₫)" className="col-span-2 sm:col-span-1">
                        <Input
                          type="number"
                          min={0}
                          max={BOARD_UNIT_PRICE_MAX}
                          value={form.unitPrice}
                          onChange={(e) => set("unitPrice", e.target.value)}
                          placeholder="Chưa nhập"
                          className="text-right tabular-nums"
                          error={!!errors.unitPrice}
                        />
                        {errors.unitPrice && <FieldError>{errors.unitPrice}</FieldError>}
                      </Field>
                      <div className="col-span-2 sm:col-span-1 flex items-end">
                        <p className="w-full rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
                          Thành tiền = SL kế hoạch × đơn giá ={" "}
                          <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                            {form.unitPrice.trim() === ""
                              ? "—"
                              : formatMoney(
                                  (Number(form.qtyPlanned) || 0) * (Number(form.unitPrice) || 0),
                                )}
                          </span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Nhóm 3 — Khác */}
              <section className="space-y-3">
                <Label uppercase>Khác</Label>
                <label className="flex cursor-pointer items-center gap-2 text-base text-zinc-700 dark:text-zinc-200">
                  <Checkbox
                    checked={form.isPinned}
                    onCheckedChange={(v) => set("isPinned", v === true)}
                  />
                  ★ Ghim lên đầu bảng (ưu tiên/khẩn)
                </label>
                <Field label="Ghi chú">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={2}
                  />
                </Field>
              </section>
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Cảnh báo khi đóng Sheet đang có thay đổi chưa lưu. */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle>
            <DialogDescription>
              Bạn có thay đổi chưa được lưu. Đóng bảng sẽ mất các thay đổi này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWarnOpen(false)}>
              Tiếp tục chỉnh sửa
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setWarnOpen(false);
                setIsDirty(false);
                onOpenChange(false);
              }}
            >
              Bỏ thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label required={required} className="mb-1 block text-base">
        {label}
      </Label>
      {children}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{children}</p>;
}

/** Ô số lượng căn phải, tabular-nums, hiện ĐVT bên phải trong cùng ô. */
function QtyWithUom({
  value,
  uom,
  onChange,
  max,
}: {
  value: string;
  uom: string;
  onChange: (v: string) => void;
  /** V4.5 QA-C P2-1 — chặn SL phi thực tế (xem lib/production-board-policy.ts). */
  max?: number;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-14 text-right tabular-nums"
      />
      {uom ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-zinc-400 dark:text-zinc-500">
          {uom}
        </span>
      ) : null}
    </div>
  );
}
