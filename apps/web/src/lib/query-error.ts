/**
 * V4.1 UI-05: hàm thuần phân loại lỗi tải dữ liệu (dùng bởi
 * components/ui/query-error.tsx). Tách riêng để test không cần JSX.
 */

interface ErrorLike {
  status?: number;
  message?: string;
  details?: unknown;
}

/** Lấy mã HTTP từ lỗi do các hook ném ra (err.status hoặc "HTTP 429"). */
export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as ErrorLike;
  if (typeof e.status === "number") return e.status;
  const m = typeof e.message === "string" ? /HTTP (\d{3})/.exec(e.message) : null;
  if (m) return Number(m[1]);
  if (typeof e.message === "string" && /quá nhiều yêu cầu/i.test(e.message)) {
    return 429;
  }
  return undefined;
}

function getRetryAfter(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const d = (error as ErrorLike).details as { retryAfter?: unknown } | undefined;
  if (d && typeof d.retryAfter === "number") return d.retryAfter;
  const msg = (error as ErrorLike).message;
  const m = typeof msg === "string" ? /sau (\d+)\s*s/i.exec(msg) : null;
  return m ? Number(m[1]) : undefined;
}

/** Thông điệp tiếng Việt theo mã lỗi. */
export function describeQueryError(error: unknown): {
  title: string;
  description: string;
} {
  const status = getErrorStatus(error);
  if (status === 429) {
    const s = getRetryAfter(error);
    return {
      title: "Hệ thống đang bận",
      description: s
        ? `Có quá nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ${s} giây.`
        : "Có quá nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.",
    };
  }
  if (status === 401) {
    return {
      title: "Phiên đăng nhập đã hết hạn",
      description: "Vui lòng tải lại trang hoặc đăng nhập lại.",
    };
  }
  if (status === 403) {
    return {
      title: "Bạn không có quyền xem dữ liệu này",
      description: "Liên hệ quản trị viên nếu bạn cần được cấp quyền.",
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      title: "Máy chủ gặp lỗi khi tải dữ liệu",
      description: "Dữ liệu vẫn an toàn. Vui lòng thử lại sau giây lát.",
    };
  }
  if (error instanceof TypeError) {
    return {
      title: "Không kết nối được máy chủ",
      description: "Kiểm tra kết nối mạng rồi thử lại.",
    };
  }
  return {
    title: "Không tải được dữ liệu",
    description: "Đã có lỗi xảy ra. Vui lòng thử lại.",
  };
}
