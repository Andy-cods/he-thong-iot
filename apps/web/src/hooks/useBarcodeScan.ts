"use client";

import * as React from "react";

/**
 * V1.9 Phase 5 — HID keyboard wedge barcode detection.
 *
 * Hầu hết barcode scanner USB/Bluetooth rẻ tiền hoạt động như bàn phím ảo
 * (HID keyboard wedge): OS nhận ký tự như user gõ + Enter cuối cùng. Trình duyệt
 * không phân biệt được đâu là scanner và đâu là bàn phím → ta dùng **timing**.
 *
 * Heuristics:
 *   - Người gõ nhanh: > 100ms/char (tiếng Anh > 150ms).
 *   - Scanner: 5 - 40 ms/char, thường đều và < 60ms/char.
 *   - Nếu khoảng cách giữa 2 ký tự > `timeBeforeScanTest` → reset buffer (user
 *     gõ thường).
 *   - Khi gặp `endKey` (mặc định "Enter") + buffer ≥ `minLength` → trigger.
 *
 * Không dùng khi focus đang ở INPUT/TEXTAREA/contentEditable (tránh "ăn" phím
 * người dùng đang gõ tay). Component có ô nhập tay cần barcode-ready có thể
 * truyền `ignoreIfFocusedOn: []` để bỏ skip, hoặc dùng hook `useScanListener`
 * bên trong component đó.
 *
 * Pattern tham khảo thư viện `use-scan-detection` (Apache 2.0) — self-host để
 * không thêm dependency.
 */
export interface UseBarcodeScanOptions {
  /** Callback khi detect được barcode hoàn chỉnh. */
  onScan: (code: string) => void;
  /** Số ký tự tối thiểu mới được tính là scan (default 4). */
  minLength?: number;
  /** Phím kết thúc 1 scan (default "Enter"). */
  endKey?: string;
  /** Thời gian tối đa giữa 2 ký tự để coi là scan (ms, default 50). */
  avgTimeByChar?: number;
  /**
   * Nếu gap > giá trị này thì reset buffer (ms, default 100).
   * Giá trị lớn hơn `avgTimeByChar` để tolerant jitter.
   */
  timeBeforeScanTest?: number;
  /** Ngăn event bubble (default true). */
  stopPropagation?: boolean;
  /** preventDefault (default true — ngăn Enter submit form). */
  preventDefault?: boolean;
  /** Disable tạm thời. */
  enabled?: boolean;
  /** Scope listener vào 1 element (default: window). */
  containerRef?: React.RefObject<HTMLElement>;
  /**
   * Tag name (uppercase) mà khi focus vào thì SKIP scan listener. Default
   * ["INPUT", "TEXTAREA"]. Truyền `[]` để không skip.
   */
  ignoreIfFocusedOn?: string[];
}

export interface UseBarcodeScanReturn {
  isScanning: boolean;
  lastScan: string | null;
}

const DEFAULT_IGNORE = ["INPUT", "TEXTAREA"];

export function useBarcodeScan(
  options: UseBarcodeScanOptions,
): UseBarcodeScanReturn {
  const {
    onScan,
    minLength = 4,
    endKey = "Enter",
    avgTimeByChar = 50,
    timeBeforeScanTest = 100,
    stopPropagation = true,
    preventDefault = true,
    enabled = true,
    containerRef,
    ignoreIfFocusedOn = DEFAULT_IGNORE,
  } = options;

  const [isScanning, setIsScanning] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<string | null>(null);

  // Giữ callback ref để không reset listener khi parent re-render thay onScan.
  const onScanRef = React.useRef(onScan);
  React.useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const target: EventTarget = containerRef?.current ?? window;

    const buffer: string[] = [];
    const times: number[] = [];
    let resetTimer: number | null = null;

    const resetBuffer = () => {
      buffer.length = 0;
      times.length = 0;
      setIsScanning(false);
    };

    const clearResetTimer = () => {
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
    };

    const shouldIgnore = (): boolean => {
      if (typeof document === "undefined") return false;
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      // Cho phép override: nếu element có attr data-scan-ready="true" thì
      // KHÔNG skip — input chủ động listen barcode.
      if (el.getAttribute("data-scan-ready") === "true") return false;
      return ignoreIfFocusedOn.includes(el.tagName);
    };

    const handleKeyDown = (ev: Event) => {
      const e = ev as KeyboardEvent;
      // IME: khi đang compose (gõ tiếng Việt/Hàn/...) thì skip.
      if (e.isComposing || e.keyCode === 229) return;

      if (shouldIgnore()) return;

      const now = performance.now();

      // Khi gặp endKey → flush.
      if (e.key === endKey) {
        if (buffer.length >= minLength) {
          const code = buffer.join("");
          if (preventDefault) e.preventDefault();
          if (stopPropagation) e.stopPropagation();
          clearResetTimer();
          resetBuffer();
          setLastScan(code);
          onScanRef.current(code);
        } else {
          // buffer quá ngắn → reset.
          clearResetTimer();
          resetBuffer();
        }
        return;
      }

      // Chỉ nhận printable single-char key.
      if (e.key.length !== 1) return;

      // Check gap giữa ký tự hiện tại và ký tự trước.
      if (times.length > 0) {
        const gap = now - times[times.length - 1]!;
        if (gap > timeBeforeScanTest) {
          // Gap lớn → reset, coi như ký tự đầu tiên của chuỗi mới.
          buffer.length = 0;
          times.length = 0;
        }
      }

      buffer.push(e.key);
      times.push(now);

      // Đo tốc độ trung bình — nếu đang ở tốc độ scan, prevent default để
      // ký tự không leak vào UI (VD không làm body scroll khi bấm Space).
      if (buffer.length >= 2) {
        const totalGap = now - times[0]!;
        const avg = totalGap / (buffer.length - 1);
        if (avg <= avgTimeByChar) {
          setIsScanning(true);
          if (preventDefault) e.preventDefault();
          if (stopPropagation) e.stopPropagation();
        }
      }

      // Safety: nếu không có endKey trong timeBeforeScanTest*3 → reset.
      clearResetTimer();
      resetTimer = window.setTimeout(() => {
        resetBuffer();
      }, timeBeforeScanTest * 3);
    };

    target.addEventListener("keydown", handleKeyDown as EventListener);
    return () => {
      target.removeEventListener("keydown", handleKeyDown as EventListener);
      clearResetTimer();
      resetBuffer();
    };
  }, [
    enabled,
    minLength,
    endKey,
    avgTimeByChar,
    timeBeforeScanTest,
    stopPropagation,
    preventDefault,
    containerRef,
    ignoreIfFocusedOn,
  ]);

  return { isScanning, lastScan };
}
