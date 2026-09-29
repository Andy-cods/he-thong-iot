import { LIMITS } from "@iot/shared";

/**
 * V4.2 audit S15 — chặn resource DoS khi import Excel: file .xlsx nén tốt có
 * thể giải nén thành workbook rất lớn dù dung lượng file nhỏ. Kiểm tra này
 * chạy SAU khi `ExcelJS.Workbook().xlsx.load()` đã xong (không tránh được chi
 * phí giải nén/parse ban đầu — cần streaming reader để làm việc đó, ngoài
 * phạm vi sửa lỗi tối thiểu này) nhưng chặn các bước tốn tài nguyên tiếp theo
 * (validate từng dòng, ghi DB) khi số dòng thực tế vượt ngưỡng hợp lý.
 */
export class ImportTooManyRowsError extends Error {
  readonly code = "IMPORT_TOO_MANY_ROWS";

  constructor(
    readonly rowCount: number,
    readonly maxRows: number = LIMITS.IMPORT_MAX_ROWS,
  ) {
    super(
      `File có ${rowCount.toLocaleString("vi-VN")} dòng dữ liệu, vượt quá giới hạn ` +
        `${maxRows.toLocaleString("vi-VN")} dòng cho mỗi lần import. Hãy tách file nhỏ hơn.`,
    );
    this.name = "ImportTooManyRowsError";
  }
}

/** Throw `ImportTooManyRowsError` nếu `rowCount` vượt giới hạn. */
export function assertImportRowLimit(
  rowCount: number,
  maxRows: number = LIMITS.IMPORT_MAX_ROWS,
): void {
  if (rowCount > maxRows) {
    throw new ImportTooManyRowsError(rowCount, maxRows);
  }
}
