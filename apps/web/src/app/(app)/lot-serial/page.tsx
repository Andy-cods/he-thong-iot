import { redirect } from "next/navigation";

/**
 * V3 redesign — `/lot-serial` đã được gộp vào `/warehouse?tab=lot-serial`.
 * Detail page `/lot-serial/[id]` giữ nguyên cho deep-link.
 */
export default function LotSerialListPage() {
  redirect("/warehouse?tab=lot-serial");
}
