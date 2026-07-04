export const ALLOWED_PATHS = [
  'suppliers.json',
  'purchase_orders.json',
  'stock_adjustments.json',
  'stock_adjustment_items.json',
  'tax_types.json',
] as const;

const ALLOWED_PARAMS = ['limit', 'since_id', 'updated_since', 'offset'] as const;
const BASE = 'https://stocky.shopifyapps.com/api/v2/';

export function isAllowedPath(p: string): boolean {
  return (ALLOWED_PATHS as readonly string[]).includes(p);
}

export function buildStockyUrl(path: string, params: Record<string, string>): string {
  const url = new URL(BASE + path);
  for (const key of ALLOWED_PARAMS) {
    if (params[key] !== undefined) url.searchParams.set(key, params[key]);
  }
  return url.toString();
}
