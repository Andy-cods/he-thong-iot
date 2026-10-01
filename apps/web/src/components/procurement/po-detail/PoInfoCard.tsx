"use client";

import * as React from "react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { formatDate } from "@/lib/format";
import type { PoDetail, PoHeaderForm } from "./types";

/**
 * V4.1 PO-UI: khung "Thông tin" gọn ở cột phải — danh sách định nghĩa 2 cột
 * (nhãn | giá trị), ô trống ẩn đi (gom thành 1 dòng "Chưa có: …") thay vì
 * hàng loạt "—". Chế độ sửa: DRAFT sửa Ngày dự kiến, Điều khoản TT, Địa chỉ
 * giao, Ghi chú; SENT chỉ Ngày dự kiến + Ghi chú.
 */

const inputCls =
  "h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export function PoInfoCard({
  po,
  editing,
  form,
  setForm,
}: {
  po: PoDetail;
  editing: boolean;
  form: PoHeaderForm;
  setForm: React.Dispatch<React.SetStateAction<PoHeaderForm>>;
}) {
  const isDraft = po.status === "DRAFT";
  const contact = po.supplierContact;
  const set = (k: keyof PoHeaderForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const rows: Array<{ label: string; value: React.ReactNode; empty?: boolean }> = [
    {
      label: "Nhà cung cấp",
      value: (
        <div className="min-w-0">
          <p className="break-words font-medium text-zinc-900 dark:text-zinc-50">
            {po.supplierName ?? po.supplierCode ?? "—"}
          </p>
          {po.supplierCode && po.supplierName ? (
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{po.supplierCode}</p>
          ) : null}
          {contact ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {[contact.name, contact.phone, contact.email].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      ),
    },
    { label: "Ngày đặt", value: formatDate(po.orderDate, "dd/MM/yyyy") },
    {
      label: "Ngày dự kiến",
      value: editing ? (
        // V4.5 QA-A: `<input type="date">` native hiện mm/dd/yyyy theo locale
        // trình duyệt — đổi sang DateField (dd/mm/yyyy, ISO không đổi).
        <DateField
          aria-label="Ngày dự kiến"
          value={form.expectedEta}
          onChange={(v) => setForm((f) => ({ ...f, expectedEta: v }))}
          size="sm"
        />
      ) : po.expectedEta ? (
        formatDate(po.expectedEta, "dd/MM/yyyy")
      ) : null,
      empty: !editing && !po.expectedEta,
    },
    {
      label: "Điều khoản TT",
      value:
        editing && isDraft ? (
          <input aria-label="Điều khoản thanh toán" value={form.paymentTerms} onChange={set("paymentTerms")} placeholder="VD Net 30" className={inputCls} />
        ) : (
          po.paymentTerms
        ),
      empty: !(editing && isDraft) && !po.paymentTerms,
    },
    {
      label: "Địa chỉ giao",
      value:
        editing && isDraft ? (
          <input aria-label="Địa chỉ giao" value={form.deliveryAddress} onChange={set("deliveryAddress")} placeholder="Địa chỉ giao hàng" className={inputCls} />
        ) : (
          <span className="break-words">{po.deliveryAddress}</span>
        ),
      empty: !(editing && isDraft) && !po.deliveryAddress,
    },
    {
      label: "PR nguồn",
      value: po.prId ? (
        <Link
          href={`/procurement/purchase-requests/${po.prId}`}
          className="font-mono text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {po.prCode ?? "Xem PR"}
        </Link>
      ) : null,
      empty: !po.prId,
    },
    {
      label: "Ghi chú",
      value: editing ? (
        <Textarea aria-label="Ghi chú" value={form.notes} onChange={set("notes")} rows={3} placeholder="Ghi chú cho NCC…" />
      ) : (
        <span className="whitespace-pre-line break-words">{po.notes}</span>
      ),
      empty: !editing && !po.notes,
    },
  ];

  const shown = rows.filter((r) => !r.empty);
  const missing = rows.filter((r) => r.empty).map((r) => r.label);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
        Thông tin
      </h2>
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 text-sm">
        {shown.map((r) => (
          <React.Fragment key={r.label}>
            <dt className="pt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{r.label}</dt>
            <dd className="min-w-0 text-zinc-800 dark:text-zinc-200">{r.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {missing.length > 0 && (
        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
          Chưa có: {missing.join(" · ")}
        </p>
      )}
    </section>
  );
}
