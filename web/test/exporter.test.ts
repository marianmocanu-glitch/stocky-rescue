import { describe, it, expect, vi } from 'vitest';
import { runExport } from '../src/exporter';

const CREDS = { storeName: 'demo.myshopify.com', apiKey: 'k' };
const PROXY = 'https://worker.example/proxy';

function respondByPath(path: string): Response {
  const data: Record<string, unknown> = {
    'suppliers.json': { suppliers: [{ id: 1, name: 'Acme', contact_email: 'a@acme.com' }] },
    'purchase_orders.json': {
      purchase_orders: [{ id: 10, number: 'PO-10', purchase_items: [{ id: 100, sku: 'S', quantity: 2 }] }],
    },
    'stock_adjustments.json': { stock_adjustments: [{ id: 20 }] },
    'stock_adjustment_items.json': { stock_adjustment_items: [{ id: 30 }] },
    'tax_types.json': { tax_types: [{ id: 40 }] },
  };
  return new Response(JSON.stringify(data[path]), { status: 200 });
}

describe('runExport', () => {
  it('produces six csv files with expected names and counts', async () => {
    const fetcher = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
      respondByPath(JSON.parse(String(init?.body)).path)
    );
    const result = await runExport(CREDS, PROXY, () => {}, fetcher as typeof fetch);
    expect(result.errors).toEqual([]);
    expect(result.files.map((f) => f.name).sort()).toEqual([
      'purchase_order_line_items.csv', 'purchase_orders.csv', 'stock_adjustment_items.csv',
      'stock_adjustments.csv', 'suppliers.csv', 'tax_types.csv',
    ]);
    expect(result.counts).toMatchObject({ suppliers: 1, purchase_orders: 1 });
    const suppliers = result.files.find((f) => f.name === 'suppliers.csv')!;
    expect(suppliers.content).toContain('contact_email');
    expect(suppliers.content).toContain('a@acme.com');
  });

  it('continues past a failing resource and records the error', async () => {
    const fetcher = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      const path = JSON.parse(String(init?.body)).path;
      if (path === 'stock_adjustments.json') return new Response('gone', { status: 404 });
      return respondByPath(path);
    });
    const result = await runExport(CREDS, PROXY, () => {}, fetcher as typeof fetch);
    expect(result.files.some((f) => f.name === 'suppliers.csv')).toBe(true);
    expect(result.files.some((f) => f.name === 'stock_adjustments.csv')).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/stock_adjustments/);
  });

  it('aborts everything on auth error (first resource 401)', async () => {
    const fetcher = vi.fn(async () => new Response('no', { status: 401 }));
    await expect(runExport(CREDS, PROXY, () => {}, fetcher as typeof fetch)).rejects.toThrow(/rejected/);
  });

  it('reports per-resource progress with resource names', async () => {
    const fetcher = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
      respondByPath(JSON.parse(String(init?.body)).path)
    );
    const progress = vi.fn();
    await runExport(CREDS, PROXY, progress, fetcher as typeof fetch);
    expect(progress).toHaveBeenCalledWith('suppliers', 1);
    expect(progress).toHaveBeenCalledWith('purchase_orders', 1);
  });
});
