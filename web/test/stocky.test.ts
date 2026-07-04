import { describe, it, expect, vi } from 'vitest';
import { fetchAll, RESOURCES, StockyAuthError, type ResourceDef } from '../src/stocky';

const CREDS = { storeName: 'demo.myshopify.com', apiKey: 'k' };
const PROXY = 'https://worker.example/proxy';
const noSleep = async () => {};

function pageResponse(rootKey: string, rows: unknown[]): Response {
  return new Response(JSON.stringify({ [rootKey]: rows }), { status: 200 });
}
function ids(from: number, to: number): { id: number }[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i }));
}

describe('RESOURCES', () => {
  it('defines the five resources with cursor directions', () => {
    expect(RESOURCES.map((r) => [r.path, r.cursor])).toEqual([
      ['suppliers.json', 'asc'],
      ['purchase_orders.json', 'desc'],
      ['stock_adjustments.json', 'asc'],
      ['stock_adjustment_items.json', 'asc'],
      ['tax_types.json', 'asc'],
    ]);
  });
});

describe('fetchAll', () => {
  const suppliers: ResourceDef = { name: 'suppliers', path: 'suppliers.json', rootKey: 'suppliers', cursor: 'asc' };
  const pos: ResourceDef = { name: 'purchase_orders', path: 'purchase_orders.json', rootKey: 'purchase_orders', cursor: 'desc' };

  it('paginates ascending using max id as since_id until short page', async () => {
    const calls: Record<string, string>[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.params);
      if (!body.params.since_id) return pageResponse('suppliers', ids(1, 250));
      return pageResponse('suppliers', ids(251, 300)); // short page → stop
    });
    const progress = vi.fn();
    const rows = await fetchAll(suppliers, CREDS, PROXY, progress, fetcher as typeof fetch, noSleep);
    expect(rows).toHaveLength(300);
    expect(calls[0]).toEqual({ limit: '250' });
    expect(calls[1]).toEqual({ limit: '250', since_id: '250' });
    expect(progress).toHaveBeenLastCalledWith(300);
  });

  it('paginates descending using min id as since_id', async () => {
    const calls: Record<string, string>[] = [];
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.params);
      if (!body.params.since_id) return pageResponse('purchase_orders', ids(751, 1000).reverse());
      return pageResponse('purchase_orders', ids(700, 750).reverse()); // short page → stop
    });
    const rows = await fetchAll(pos, CREDS, PROXY, () => {}, fetcher as typeof fetch, noSleep);
    expect(rows).toHaveLength(301);
    expect(calls[1]).toEqual({ limit: '250', since_id: '751' });
  });

  it('retries on 429 with backoff then succeeds', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const fetcher = vi.fn(async () => {
      n += 1;
      if (n <= 2) return new Response('slow down', { status: 429 });
      return pageResponse('suppliers', ids(1, 10));
    });
    const rows = await fetchAll(suppliers, CREDS, PROXY, () => {}, fetcher as typeof fetch, async (ms) => { sleeps.push(ms); });
    expect(rows).toHaveLength(10);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('throws StockyAuthError on 401 without retrying', async () => {
    const fetcher = vi.fn(async () => new Response('no', { status: 401 }));
    await expect(fetchAll(suppliers, CREDS, PROXY, () => {}, fetcher as typeof fetch, noSleep)).rejects.toBeInstanceOf(StockyAuthError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('gives up after 7 consecutive 429s with a descriptive error', async () => {
    const fetcher = vi.fn(async () => new Response('slow down', { status: 429 }));
    await expect(fetchAll(suppliers, CREDS, PROXY, () => {}, fetcher as typeof fetch, noSleep)).rejects.toThrow(/rate limit/i);
    expect(fetcher).toHaveBeenCalledTimes(8); // 1 try + 7 retries
  });

  it('throws instead of looping forever when since_id does not advance', async () => {
    const fetcher = vi.fn(async () => pageResponse('suppliers', ids(1, 250))); // same full page forever
    await expect(fetchAll(suppliers, CREDS, PROXY, () => {}, fetcher as typeof fetch, noSleep)).rejects.toThrow(/did not advance/);
    expect(fetcher).toHaveBeenCalledTimes(2); // initial + one stalled repeat, then abort
  });

  it('throws when a full page has no numeric ids', async () => {
    const rows = Array.from({ length: 250 }, () => ({ name: 'x' }));
    const fetcher = vi.fn(async () => pageResponse('suppliers', rows));
    await expect(fetchAll(suppliers, CREDS, PROXY, () => {}, fetcher as typeof fetch, noSleep)).rejects.toThrow(/no numeric ids/);
  });
});
