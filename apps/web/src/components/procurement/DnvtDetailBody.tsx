import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V3.10 — Body trang chi tiết cho phiếu form_type='DNVT' (đọc-only). Khớp form
 * giấy DNVT 567: bảng 14 cột (KHÔNG Mã VT/Đơn giá/Tổng tiền), mục III 5 dòng,
 * KHÔNG mục IV/V. Toolbar + dialog duyệt dùng chung ở page cha (không đụng).
 */

interface DnvtDetailLine {
  id: string;
  name?: string | null;
  specification?: string | null;
  uom?: string | null;
  itemUom?: string | null;
  qty: string | number;
  onHandSnapshot?: string | number | null;
  approvedQty?: string | number | null;
  neededBy?: string | Date | null;
  priority?: string | null;
  category?: string | null;
  referenceCode?: string | null;
  referenceNote?: string | null;
  notes?: string | null;
  deliveryDate?: string | Date | null;
}

export interface DnvtDetailPr {
  paperFormNo?: string | null;
  code: string;
  createdAt: string | Date;
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestedByName?: string | null;
  requestReason?: string | null;
  lines: DnvtDetailLine[];
  approvalStep?: string | null;
  deptApprovedByName?: string | null;
  deptApprovedAt?: string | Date | null;
  directorApprovedByName?: string | null;
  directorApprovedAt?: string | Date | null;
  rejectedByName?: string | null;
  rejectedAt?: string | Date | null;
  rejectionReason?: string | null;
}

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "Khẩn",
  NORMAL: "Bình thường",
  RESERVE: "Dự phòng",
};
const CATEGORY_LABELS: Record<string, string> = {
  TOOL: "CCDC",
  CONSUMABLE: "Tiêu hao",
  MATERIAL: "Vật tư",
  OTHER: "Khác",
};

function fmtDateVN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
function fmtDateTimeVN(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("vi-VN");
}

export function DnvtDetailBody({ pr }: { pr: DnvtDetailPr }) {
  const paperFormNo = pr.paperFormNo ?? pr.code;
  const step = pr.approvalStep ?? "DRAFT";

  return (
    <article className="border-2 border-zinc-900 bg-white text-zinc-900 shadow-md print:border print:border-zinc-900 print:shadow-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 print:dark:border-zinc-900 print:dark:bg-white print:dark:text-zinc-900">
      {/* Header */}
      <div className="grid grid-cols-[1fr_2fr_1fr] items-center gap-2 border-b-2 border-zinc-900 px-4 py-3 text-[12px] print:dark:border-zinc-900">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/logo-gtam.png"
            alt="GTAM"
            width={56}
            height={60}
            className="h-14 w-auto shrink-0 object-contain"
          />
          <div className="font-bold tracking-wide">XƯỞNG SXKD</div>
        </div>
        <div className="text-center text-[14px] font-bold">
          CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA
          <br />
          CÔNG NGHỆ TOÀN CẦU
        </div>
        <div className="space-y-1 text-right text-[12px]">
          <div>
            <span className="font-bold">Số phiếu: </span>
            <span className="rounded bg-[#005D9F] px-2 py-0.5 font-mono text-[12px] text-white">
              {paperFormNo}
            </span>
          </div>
          <div>
            <span className="font-bold">Ngày lập: </span>
            <span className="font-mono">{fmtDateVN(pr.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="border-b-2 border-zinc-900 bg-[#F5F5F5] px-4 py-2 text-center print:dark:border-zinc-900 print:dark:bg-zinc-100 dark:bg-zinc-800">
        <h2 className="text-[20px] font-bold tracking-wide text-zinc-900 dark:text-zinc-50 print:dark:text-zinc-900">
          PHIẾU ĐỀ XUẤT VẬT TƯ — NPL
        </h2>
      </div>

      {/* I. Thông tin chung */}
      <section className="border-b border-zinc-300 print:dark:border-zinc-300">
        <SectionTitle>I. Thông tin chung</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <FieldRow label="Kính gửi:">
            <span>{pr.targetDepartment ?? "—"}</span>
          </FieldRow>
          <FieldRow label="Bộ phận đề xuất:">
            <span>{pr.proposingDepartment ?? "—"}</span>
          </FieldRow>
          <FieldRow label="Người đề xuất:">
            <span className="font-medium">{pr.requestedByName ?? "—"}</span>
          </FieldRow>
          <FieldRow label="Lý do đề xuất:" wide>
            <span className="whitespace-pre-line">
              {pr.requestReason ?? "—"}
            </span>
          </FieldRow>
        </div>
      </section>

      {/* II. Danh mục vật tư (14 cột) */}
      <section className="border-b border-zinc-300 print:dark:border-zinc-300">
        <SectionTitle>II. Danh mục vật tư</SectionTitle>
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
                <Th w="w-8">STT</Th>
                <Th w="min-w-[150px]">Tên vật tư</Th>
                <Th w="min-w-[120px]">Quy cách chi tiết</Th>
                <Th w="w-14">ĐVT</Th>
                <Th w="w-14" align="right">SL YC</Th>
                <Th w="w-16" align="right">Tồn kho</Th>
                <Th w="w-14" align="right">Duyệt</Th>
                <Th w="w-28">Ngày cần</Th>
                <Th w="w-28">Ưu tiên</Th>
                <Th w="w-28">Phân loại</Th>
                <Th w="w-24">Mã tham chiếu</Th>
                <Th w="w-20">Tham khảo</Th>
                <Th w="min-w-[110px]">Ghi chú</Th>
                <Th w="w-28">Ngày giao hàng</Th>
              </tr>
            </thead>
            <tbody>
              {pr.lines.map((l, idx) => {
                const qty = Number(l.qty) || 0;
                const onHand =
                  l.onHandSnapshot != null ? Number(l.onHandSnapshot) : null;
                const approvedQty =
                  l.approvedQty != null ? Number(l.approvedQty) : null;
                const lowStock =
                  onHand != null && qty > 0 ? onHand < qty : false;
                return (
                  <tr
                    key={l.id}
                    className={cn(
                      "border-b border-zinc-200 align-top dark:border-zinc-700 print:dark:border-zinc-300",
                      idx % 2 === 1
                        ? "bg-zinc-50/40 dark:bg-zinc-800/30 print:dark:bg-zinc-50/40"
                        : "",
                    )}
                  >
                    <Td>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
                        {idx + 1}
                      </span>
                    </Td>
                    <Td>
                      <span className="block break-words font-medium">
                        {l.name ?? "—"}
                      </span>
                    </Td>
                    <Td>{l.specification ?? "—"}</Td>
                    <Td align="center">{l.uom ?? l.itemUom ?? "—"}</Td>
                    <Td align="right">
                      <span className="font-mono">{fmtNum(qty)}</span>
                    </Td>
                    <Td align="right">
                      {onHand != null ? (
                        <span
                          className={cn(
                            "font-mono",
                            lowStock
                              ? "font-semibold text-rose-600 dark:text-rose-400 print:dark:text-rose-600"
                              : "text-emerald-700 dark:text-emerald-400 print:dark:text-emerald-700",
                          )}
                        >
                          {fmtNum(onHand)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      {approvedQty != null ? (
                        <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 print:dark:text-emerald-700">
                          {fmtNum(approvedQty)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </Td>
                    <Td>{fmtDateVN(l.neededBy)}</Td>
                    <Td>{PRIORITY_LABELS[l.priority ?? "NORMAL"] ?? "—"}</Td>
                    <Td>{CATEGORY_LABELS[l.category ?? "OTHER"] ?? "—"}</Td>
                    <Td>{l.referenceCode ?? "—"}</Td>
                    <Td>{l.referenceNote ?? "—"}</Td>
                    <Td>{l.notes ?? "—"}</Td>
                    <Td>{fmtDateVN(l.deliveryDate)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* III. Kiểm tra & Phê duyệt (5 dòng) */}
      <section className="border-b border-zinc-300 print:dark:border-zinc-300">
        <SectionTitle>III. Kiểm tra &amp; Phê duyệt</SectionTitle>
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:bg-zinc-100 print:dark:text-zinc-700">
              <Th w="w-48">Vai trò</Th>
              <Th w="w-56">Họ tên</Th>
              <Th>Ký tên / Ngày</Th>
            </tr>
          </thead>
          <tbody>
            <ApprovalRow
              role="Người đề xuất"
              name={pr.requestedByName ?? null}
              date={fmtDateTimeVN(pr.createdAt)}
              signed
            />
            <ApprovalRow role="Kiểm tra tồn kho" name={null} date=" " />
            <ApprovalRow role="Kiểm tra kỹ thuật" name={null} date=" " />
            <ApprovalRow
              role="Trưởng bộ phận"
              name={pr.deptApprovedByName ?? null}
              date={pr.deptApprovedAt ? fmtDateTimeVN(pr.deptApprovedAt) : " "}
              signed={!!pr.deptApprovedAt}
            />
            <ApprovalRow
              role="Giám đốc"
              name={pr.directorApprovedByName ?? null}
              date={
                pr.directorApprovedAt
                  ? fmtDateTimeVN(pr.directorApprovedAt)
                  : " "
              }
              signed={!!pr.directorApprovedAt}
            />
            {step === "REJECTED" && pr.rejectionReason ? (
              <tr className="border-b border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/30">
                <Td>
                  <span className="font-bold text-red-700 dark:text-red-300">
                    Từ chối
                  </span>
                </Td>
                <Td>{pr.rejectedByName ?? "—"}</Td>
                <Td>
                  <span className="text-red-700 dark:text-red-300">
                    {fmtDateTimeVN(pr.rejectedAt)} — {pr.rejectionReason}
                  </span>
                </Td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {/* Footer mẫu */}
      <div className="px-4 py-2 text-right text-[10px] italic text-zinc-500 dark:text-zinc-400 print:dark:text-zinc-500">
        Mẫu No: GTAM/PRD-MRF-02 | Phiên bản: 1.0 | Hiệu lực: 2025
      </div>
    </article>
  );
}

/* ---------- helpers ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center bg-[#005D9F] px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-white print:py-1">
      {children}
    </div>
  );
}

function FieldRow({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[140px_1fr] border-b border-zinc-200 dark:border-zinc-700 print:dark:border-zinc-300",
        wide ? "md:col-span-2" : "",
      )}
    >
      <div className="border-r border-zinc-200 bg-[#F5F5F5] px-3 py-2 text-[12px] font-bold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 print:dark:border-zinc-300 print:dark:bg-zinc-100 print:dark:text-zinc-800">
        {label}
      </div>
      <div className="flex min-h-[28px] items-center px-3 py-1">{children}</div>
    </div>
  );
}

function Th({
  children,
  w,
  align = "left",
}: {
  children: React.ReactNode;
  w?: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "border-b border-r border-zinc-300 px-2 py-1.5 dark:border-zinc-700 print:dark:border-zinc-300",
        w,
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      className={cn(
        "border-r border-zinc-200 align-top whitespace-normal break-words px-2 py-1 dark:border-zinc-700 print:dark:border-zinc-300",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      {children}
    </td>
  );
}

function ApprovalRow({
  role,
  name,
  date,
  signed,
}: {
  role: string;
  name: string | null;
  date: string;
  signed?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-zinc-200 dark:border-zinc-700 print:dark:border-zinc-300",
        signed ? "bg-emerald-50/40 dark:bg-emerald-950/20" : "",
      )}
    >
      <Td>
        <span className="font-medium">{role}</span>
      </Td>
      <Td>{name || " "}</Td>
      <Td>
        <span className="font-mono text-[10.5px]">
          {signed ? `✓ ${date}` : date}
        </span>
      </Td>
    </tr>
  );
}
