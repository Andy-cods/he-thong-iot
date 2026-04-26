import { redirect } from "next/navigation";

/**
 * V3 redesign — `/receiving` đã được gộp vào `/warehouse?tab=receiving`.
 * Detail page `/receiving/[poId]` giữ nguyên cho operator scan PWA.
 */
export default function ReceivingHubPage() {
  redirect("/warehouse?tab=receiving");
}
