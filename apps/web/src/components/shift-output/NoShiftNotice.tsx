import Link from "next/link";

/** Site chưa có ca nào đang dùng → hướng dẫn xưởng tự thêm ca (không có ca mặc định). */
export function NoShiftNotice() {
  return (
    <div className="mb-3 rounded-xl bg-amber-50 p-4 text-md text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
      <p className="font-semibold">Chưa có ca làm việc</p>
      <p className="mt-1">
        Xưởng tự thêm ca theo giờ chạy thực tế, ví dụ 07:00–19:00 và 19:00–07:00. Cần thêm ca thì bổ sung bất cứ lúc nào.
      </p>
      <Link
        href="/san-luong/cai-dat?tab=shifts"
        className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700"
      >
        Thêm ca làm việc
      </Link>
    </div>
  );
}
