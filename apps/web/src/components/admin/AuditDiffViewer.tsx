"use client";

/**
 * AuditDiffViewer — wrap `react-diff-viewer-continued` với V2 style.
 *
 * Dùng dynamic import để lazy-load lib (bundle size lớn, chỉ load khi user
 * mở diff). JSON-stringify before/after với indent 2 để dễ đọc.
 *
 * Style: zinc + blue palette đồng bộ V2 (match AuditRow action colors):
 *   - Added line: emerald-50 / emerald-200 border
 *   - Removed line: red-50 / red-200 border
 *   - Gutter: zinc-400 tabular-nums
 */

import * as React from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

export interface AuditDiffViewerProps {
  beforeJson: unknown | null;
  afterJson: unknown | null;
  splitView?: boolean;
}

function stringify(val: unknown | null): string {
  if (val === null || val === undefined) return "";
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function AuditDiffViewer({
  beforeJson,
  afterJson,
  splitView = false,
}: AuditDiffViewerProps) {
  const before = stringify(beforeJson);
  const after = stringify(afterJson);

  // CREATE: only after
  if (!beforeJson && afterJson) {
    return (
      <div className="overflow-hidden rounded-md border border-emerald-200 bg-emerald-50">
        <div className="border-b border-emerald-200 bg-emerald-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
          Bản ghi mới (CREATE)
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-emerald-900">
          {after}
        </pre>
      </div>
    );
  }

  // DELETE: only before
  if (beforeJson && !afterJson) {
    return (
      <div className="overflow-hidden rounded-md border border-red-200 bg-red-50">
        <div className="border-b border-red-200 bg-red-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
          Bản ghi bị xoá (DELETE)
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-red-900">
          {before}
        </pre>
      </div>
    );
  }

  // UPDATE: full diff
  if (!beforeJson && !afterJson) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
        Không có dữ liệu diff.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white text-[11px]">
      <ReactDiffViewer
        oldValue={before}
        newValue={after}
        splitView={splitView}
        compareMethod={DiffMethod.LINES}
        useDarkTheme={false}
        hideLineNumbers={false}
        showDiffOnly={true}
        extraLinesSurroundingDiff={1}
        styles={{
          variables: {
            light: {
              diffViewerBackground: "#ffffff",
              diffViewerColor: "#18181b",
              addedBackground: "#ecfdf5",
              addedColor: "#065f46",
              removedBackground: "#fef2f2",
              removedColor: "#991b1b",
              wordAddedBackground: "#a7f3d0",
              wordRemovedBackground: "#fecaca",
              addedGutterBackground: "#d1fae5",
              removedGutterBackground: "#fee2e2",
              gutterBackground: "#fafafa",
              gutterBackgroundDark: "#f4f4f5",
              highlightBackground: "#dbeafe",
              highlightGutterBackground: "#bfdbfe",
              codeFoldGutterBackground: "#f4f4f5",
              codeFoldBackground: "#fafafa",
              emptyLineBackground: "#fafafa",
              gutterColor: "#a1a1aa",
              addedGutterColor: "#065f46",
              removedGutterColor: "#991b1b",
              codeFoldContentColor: "#71717a",
              diffViewerTitleBackground: "#fafafa",
              diffViewerTitleColor: "#18181b",
              diffViewerTitleBorderColor: "#e4e4e7",
            },
          },
          contentText: {
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: "11px",
            lineHeight: "1.5",
          },
          gutter: {
            fontSize: "10px",
            padding: "0 8px",
            minWidth: "32px",
          },
          line: {
            fontSize: "11px",
          },
        }}
      />
    </div>
  );
}
