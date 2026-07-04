export interface Creds { storeName: string; apiKey: string; }
export interface ResourceDef { name: string; path: string; rootKey: string; cursor: 'asc' | 'desc'; }

export const RESOURCES: ResourceDef[] = [
  { name: 'suppliers', path: 'suppliers.json', rootKey: 'suppliers', cursor: 'asc' },
  { name: 'purchase_orders', path: 'purchase_orders.json', rootKey: 'purchase_orders', cursor: 'desc' },
  { name: 'stock_adjustments', path: 'stock_adjustments.json', rootKey: 'stock_adjustments', cursor: 'asc' },
  { name: 'stock_adjustment_items', path: 'stock_adjustment_items.json', rootKey: 'stock_adjustment_items', cursor: 'asc' },
  { name: 'tax_types', path: 'tax_types.json', rootKey: 'tax_types', cursor: 'asc' },
];

export class StockyAuthError extends Error {
  constructor() { super('Stocky rejected the store name or API key'); }
}
export class StockyHttpError extends Error {
  constructor(public status: number, resource: string) { super(`Stocky returned HTTP ${status} for ${resource}`); }
}

const PAGE = 250;
const MAX_RETRIES = 7;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchPage(
  def: ResourceDef, creds: Creds, proxyUrl: string,
  params: Record<string, string>, fetcher: typeof fetch, sleep: (ms: number) => Promise<void>
): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetcher(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeName: creds.storeName, apiKey: creds.apiKey, path: def.path, params }),
    });
    if (res.status === 401 || res.status === 403) throw new StockyAuthError();
    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) throw new Error(`Stocky rate limit persisted after ${MAX_RETRIES} retries`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new StockyHttpError(res.status, def.name);
    const json = (await res.json()) as Record<string, unknown>;
    return (json[def.rootKey] as Record<string, unknown>[]) ?? [];
  }
}

export async function fetchAll(
  def: ResourceDef, creds: Creds, proxyUrl: string,
  onProgress: (count: number) => void,
  fetcher: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let sinceId: number | undefined;
  for (;;) {
    const params: Record<string, string> = { limit: String(PAGE) };
    if (sinceId !== undefined) params.since_id = String(sinceId);
    const page = await fetchPage(def, creds, proxyUrl, params, fetcher, sleep);
    all.push(...page);
    onProgress(all.length);
    if (page.length < PAGE) return all;
    const pageIds = page.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
    if (pageIds.length === 0) throw new Error(`Cannot paginate ${def.name}: page has no numeric ids`);
    const next = def.cursor === 'asc' ? Math.max(...pageIds) : Math.min(...pageIds);
    if (next === sinceId) throw new Error(`Pagination stalled for ${def.name}: since_id ${sinceId} did not advance`);
    sinceId = next;
    await sleep(150);
  }
}
