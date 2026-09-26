import type { RoutingStep } from "@/hooks/useWorkOrders";

/**
 * V4.1 (SX-01) — Chuẩn hoá `work_order.routing_plan` về mảng `RoutingStep[]`.
 *
 * Lệnh SX tạo từ dòng BOM (nút GTAM, `from-bom-line`) trước đây chép nguyên
 * `bom_line.metadata.routing` — một OBJECT `{ materialCode, processRoute: string[],
 * estimatedHours, … }` — vào `routingPlan`. Trang chi tiết gọi `.reduce/.map` như
 * mảng nên văng trắng trang. DB có thể còn sẵn các bản ghi dạng object này, nên
 * mọi chỗ ĐỌC phải đi qua hàm này (không chỉ sửa chỗ ghi).
 *
 * - Mảng → lọc bỏ phần tử không phải object.
 * - Object có `processRoute: string[]` → mỗi công đoạn thành 1 bước.
 * - Còn lại (null, chuỗi, object rỗng…) → [].
 */
export function normalizeRoutingPlan(raw: unknown): RoutingStep[] {
  if (Array.isArray(raw)) {
    return raw.filter(
      (s): s is RoutingStep => typeof s === "object" && s !== null,
    );
  }
  if (raw && typeof raw === "object") {
    const route = (raw as { processRoute?: unknown }).processRoute;
    if (Array.isArray(route)) {
      return route
        .map((name) => String(name ?? "").trim())
        .filter((name) => name.length > 0)
        .map((name, i) => ({ step_no: i + 1, name }));
    }
  }
  return [];
}

/** Trả `null` khi không có công đoạn nào — dùng khi GHI vào DB. */
export function routingPlanForInsert(raw: unknown): RoutingStep[] | null {
  const steps = normalizeRoutingPlan(raw);
  return steps.length > 0 ? steps : null;
}
