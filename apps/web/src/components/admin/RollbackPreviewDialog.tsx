"use client";

/**
 * RollbackPreviewDialog — V1.4 stub: hiển thị SQL rollback đề xuất,
 * **KHÔNG** auto-execute. User copy-paste vào `psql` để chạy thủ công.
 *
 * Logic sinh SQL:
 *   - CREATE (before=null, after!=null) → DELETE FROM table WHERE id = '...'
 *   - DELETE (before!=null, after=null) → INSERT INTO table (...) VALUES (...)
 *   - UPDATE (cả hai) → UPDATE table SET col = val WHERE id = '...' (chỉ field khác)
 */

import * as React from "react";
import { AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface RollbackPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  objectType: string;
  objectId: string | null;
  beforeJson: unknown | null;
  afterJson: unknown | null;
}

function sqlLiteral(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
  // Object/array → JSONB literal
  const json = JSON.stringify(val).replace(/'/g, "''");
  return `'${json}'::jsonb`;
}

function diffKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set<string>([
    ...Object.keys(before),
    ...Object.keys(after),
  ]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      changed.push(k);
    }
  }
  return changed;
}

function generateRollbackSql(
  action: string,
  objectType: string,
  objectId: string | null,
  before: unknown | null,
  after: unknown | null,
): string {
  const table = `app.${objectType}`;
  const idClause = objectId ? `'${objectId}'` : "<objectId>";

  // CREATE → rollback = DELETE
  if (action === "CREATE" || (!before && after)) {
    return [
      `-- Rollback CREATE: xoá bản ghi vừa tạo`,
      `DELETE FROM ${table} WHERE id = ${idClause};`,
    ].join("\n");
  }

  // DELETE → rollback = INSERT lại
  if (action === "DELETE" || (before && !after)) {
    const b = (before as Record<string, unknown>) ?? {};
    const cols = Object.keys(b);
    if (cols.length === 0) {
      return `-- Không có dữ liệu before để rollback DELETE.`;
    }
    const colList = cols.join(", ");
    const valList = cols.map((c) => sqlLiteral(b[c])).join(", ");
    return [
      `-- Rollback DELETE: tái tạo bản ghi đã xoá`,
      `INSERT INTO ${table} (${colList})`,
      `VALUES (${valList});`,
    ].join("\n");
  }

  // UPDATE → rollback = set lại giá trị before chỉ field đã đổi
  if (action === "UPDATE" || (before && after)) {
    const b = (before as Record<string, unknown>) ?? {};
    const a = (after as Record<string, unknown>) ?? {};
    const changed = diffKeys(b, a);
    if (changed.length === 0) {
      return `-- Không có field nào thay đổi, không cần rollback.`;
    }
    const setClause = changed
      .map((k) => `  ${k} = ${sqlLiteral(b[k])}`)
      .join(",\n");
    return [
      `-- Rollback UPDATE: khôi phục ${changed.length} field về giá trị trước`,
      `UPDATE ${table} SET`,
      setClause,
      `WHERE id = ${idClause};`,
    ].join("\n");
  }

  return `-- Action "${action}" chưa hỗ trợ rollback preview.`;
}

export function RollbackPreviewDialog({
  open,
  onOpenChange,
  action,
  objectType,
  objectId,
  beforeJson,
  afterJson,
}: RollbackPreviewDialogProps) {
  const [copied, setCopied] = React.useState(false);
  const sql = React.useMemo(
    () =>
      generateRollbackSql(action, objectType, objectId, beforeJson, afterJson),
    [action, objectType, objectId, beforeJson, afterJson],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      toast.success("Đã copy SQL rollback vào clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy thất bại. Hãy chọn text thủ công.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>SQL rollback đề xuất</DialogTitle>
          <DialogDescription>
            Script mẫu để hoàn tác thao tác <code className="font-mono">{action}</code> trên{" "}
            <code className="font-mono">{objectType}</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="text-xs text-amber-900">
            <p className="font-semibold">Cảnh báo V1.4</p>
            <p className="mt-1">
              V1.4 chỉ preview SQL, KHÔNG tự động thực thi. V2 sẽ hỗ trợ rollback thật.
              Admin phải copy và paste vào <code className="font-mono">psql</code> hoặc
              DBeaver, kiểm tra kỹ CASCADE/FK trước khi chạy.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-950">
          <pre className="max-h-[320px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
            {sql}
          </pre>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={handleCopy}>
            {copied ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? "Đã copy" : "Copy SQL"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
