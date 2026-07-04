function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function flattenPurchaseOrders(pos: Record<string, unknown>[]): {
  orders: Record<string, unknown>[];
  lineItems: Record<string, unknown>[];
} {
  const orders: Record<string, unknown>[] = [];
  const lineItems: Record<string, unknown>[] = [];
  for (const po of pos) {
    const { purchase_items, ...order } = po as { purchase_items?: Record<string, unknown>[] } & Record<string, unknown>;
    orders.push(order);
    for (const item of purchase_items ?? []) {
      lineItems.push({ purchase_order_id: po.id, purchase_order_number: po.number, ...item });
    }
  }
  return { orders, lineItems };
}
