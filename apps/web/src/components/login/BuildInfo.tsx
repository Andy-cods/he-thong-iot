/**
 * Direction B — BuildInfo footer.
 *
 * Đọc env `NEXT_PUBLIC_BUILD_SHA` + `NEXT_PUBLIC_BUILD_DATE` (set lúc build
 * trong CI/Docker). Nếu thiếu → fallback "dev".
 *
 * Server component OK vì chỉ đọc env, không dùng hook.
 */
export function BuildInfo({ className }: { className?: string }) {
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
  const date = process.env.NEXT_PUBLIC_BUILD_DATE || "";
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v1.0.0";

  const short = sha.length > 7 ? sha.slice(0, 7) : sha;
  const when = date ? formatBuildDate(date) : "";

  return (
    <p
      className={
        className ??
        "text-center font-mono text-xs text-slate-500"
      }
    >
      Build <span className="text-slate-700">{short}</span>
      {" · "}
      {version}
      {when ? (
        <>
          {" · "}
          {when}
        </>
      ) : null}
    </p>
  );
}

function formatBuildDate(raw: string): string {
  // raw có thể là ISO (2026-04-17T...) hoặc chuỗi tự do.
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
