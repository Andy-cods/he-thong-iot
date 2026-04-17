/**
 * V2 BuildInfo footer (design-spec §2.1).
 *
 * Format: `v{VERSION} · {SHA7} · {DATE}` font-mono 11px text-zinc-400.
 * Server component — đọc `NEXT_PUBLIC_BUILD_*` env (set lúc build CI/Docker).
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
        "text-center font-mono text-xs text-zinc-400"
      }
    >
      {version}
      {" · "}
      <span className="text-zinc-500">{short}</span>
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
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
