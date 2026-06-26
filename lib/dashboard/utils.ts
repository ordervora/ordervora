/**
 * Dashboard utilities: formatting, date windows, and exports.
 *
 * Shared by the dashboard sections so money, dates, and analytics windows are
 * consistent everywhere, and so CSV/PDF/receipt export logic lives in one place.
 */

/** Formats a number as currency. */
export function money(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount);
}

/** Formats a count with thousands separators. */
export function count(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/** A short date-time label. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A short date label. */
export function dateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A clock label. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface DateWindow {
  from: string;
  to: string;
}

/** The window covering "today" in the local timezone. */
export function todayWindow(): DateWindow {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** A window covering the last `days` days through now. */
export function lastDaysWindow(days: number): DateWindow {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Triggers a client-side CSV download from rows of records. Columns are derived
 * from the provided header map (key → label). Values are CSV-escaped.
 */
export function downloadCsv(
  filename: string,
  headers: Record<string, string>,
  rows: Record<string, string | number | null>[],
): void {
  const keys = Object.keys(headers);
  const escape = (value: string | number | null): string => {
    const str = value === null ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [
    keys.map((k) => escape(headers[k] ?? k)).join(','),
    ...rows.map((row) => keys.map((k) => escape(row[k] ?? '')).join(',')),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Opens a print-friendly window with the given HTML and invokes print. Used for
 * receipts and PDF export (the browser's "Save as PDF" handles the PDF case).
 */
export function printHtml(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=420,height=640');
  if (!win) return;
  win.document.write(
    `<!doctype html><html><head><title>${title}</title>` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<style>body{font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;color:#15130f}` +
      `h1{font-size:18px;margin:0 0 4px}.muted{color:#736b5f;font-size:12px}` +
      `table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}` +
      `td{padding:4px 0}.r{text-align:right;font-variant-numeric:tabular-nums}` +
      `.tot{font-weight:800;border-top:1px solid #ddd;padding-top:6px}` +
      `hr{border:none;border-top:1px dashed #ccc;margin:12px 0}</style></head>` +
      `<body>${bodyHtml}</body></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}
