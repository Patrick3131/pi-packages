import type { ContextInspectionReport } from "./types.js";

export function renderReportJson(report: ContextInspectionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
