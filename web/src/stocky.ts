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
  let mode: 'cursor' | 'offset' = 'cursor';
  let offset = 0;
  let fetches = 0;
  for (;;) {
    if (++fetches > 800) throw new Error(`Pagination cap reached for ${def.name}`);
    const params: Record<string, string> = { limit: String(PAGE) };
    if (mode === 'cursor' && sinceId !== undefined) params.since_id = String(sinceId);
    if (mode === 'offset') params.offset = String(offset);
    const page = await fetchPage(def, creds, proxyUrl, params, fetcher, sleep);
    all.push(...page);
    onProgress(all.length);
    if (page.length < PAGE) break;
    if (mode === 'cursor') {
      const pageIds = page.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
      const next = pageIds.length === 0
        ? undefined
        : def.cursor === 'asc' ? Math.max(...pageIds) : Math.min(...pageIds);
      if (next === undefined || next === sinceId) {
        // Stall detected: if ids exist and stalled, the page is a duplicate — remove it before switching.
        if (next !== undefined) {
          // next === sinceId: definite duplicate page — drop it
          all.splice(all.length - page.length);
          onProgress(all.length);
        }
        // For no-id case (next === undefined) the page is unknown; keep it, offset from current all.length.
        mode = 'offset';
        offset = all.length;
      } else {
        sinceId = next;
      }
    } else {
      offset += page.length;
    }
    await sleep(150);
  }
  // Dedupe by numeric id, keep first occurrence; rows without numeric ids pass through unchanged.
  const seen = new Set<number>();
  return all.filter((r) => {
    const id = Number(r.id);
    if (!Number.isFinite(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
