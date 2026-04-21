// V1.7-beta fix — BOM Workspace Layout PASSTHROUGH.
//
// Tại sao passthrough: nếu layout này là "use client" và wrap children
// trong các component/div, Next 14 sẽ KHÔNG fire HTTP 307 từ page.tsx
// con gọi `redirect()` (bug/limitation khi server page nested trong
// client layout). Kết quả: 7 sub-route redirect hết fail + `/bom/[id]`
// redirect fail.
//
// Fix: move BomWorkspaceTopbar + HistoryDrawer xuống grid/page.tsx +
// tree/page.tsx (các page thực sự render, không redirect). Layout này
// chỉ pass children.
//
// Side-effect: sub-route redirect + `/bom/[id]` redirect hoạt động lại
// với HTTP 307 đúng chuẩn.
export default function BomWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
