/**
 * V3.11.1 — Tải file từ 1 endpoint qua fetch → blob → <a download>.
 *
 * Ổn định hơn `window.open(url, "_blank")`: không bị popup-blocker chặn, không
 * để lại tab trắng, và ĐỌC ĐƯỢC lỗi (route trả JSON 4xx/5xx) để hiển thị toast
 * thay vì mở tab hiện JSON thô.
 *
 * Tên file lấy từ header Content-Disposition (ưu tiên filename*=UTF-8''…), nếu
 * không có thì dùng `fallbackName`.
 *
 * Throw Error(message) khi response không OK — caller nên bắt để toast.
 */
export async function downloadFromUrl(
  url: string,
  fallbackName: string,
): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      /* body không phải JSON — giữ message HTTP mặc định */
    }
    throw new Error(msg);
  }

  // Tên file từ Content-Disposition (nếu server cung cấp).
  let name = fallbackName;
  const cd = res.headers.get("content-disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  if (star?.[1]) {
    try {
      name = decodeURIComponent(star[1]);
    } catch {
      /* giữ fallback nếu decode lỗi */
    }
  } else if (plain?.[1]) {
    name = plain[1];
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
