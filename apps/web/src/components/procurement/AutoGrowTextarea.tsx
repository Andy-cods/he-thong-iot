"use client";

import * as React from "react";

/**
 * m7 — ô nhiều dòng tự giãn chiều cao theo nội dung (tối thiểu `minRows` dòng) để quy cách dài
 * và placeholder không bị cắt. Dùng cho cột "Quy cách" của form MRF/DNVT.
 */
export function AutoGrowTextarea({
  minRows = 2,
  value,
  className,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  minRows?: number;
  value: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  React.useLayoutEffect(fit, [fit, value]);
  React.useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={className}
      style={{ overflow: "hidden", overflowWrap: "anywhere" }}
      {...rest}
    />
  );
}
