import { describe, it, expect } from 'vitest';
import { isAllowedPath, buildStockyUrl, ALLOWED_PATHS } from '../src/whitelist';

describe('isAllowedPath', () => {
  it('allows exactly the five documented endpoints', () => {
    expect(ALLOWED_PATHS).toEqual([
      'suppliers.json',
      'purchase_orders.json',
      'stock_adjustments.json',
      'stock_adjustment_items.json',
      'tax_types.json',
    ]);
    for (const p of ALLOWED_PATHS) expect(isAllowedPath(p)).toBe(true);
  });
  it('rejects anything else, including traversal and lookalikes', () => {
    expect(isAllowedPath('suppliers.json/../admin')).toBe(false);
    expect(isAllowedPath('purchase_orders')).toBe(false);
    expect(isAllowedPath('')).toBe(false);
    expect(isAllowedPath('SUPPLIERS.JSON')).toBe(false);
  });
});

describe('buildStockyUrl', () => {
  it('builds base url with no params', () => {
    expect(buildStockyUrl('suppliers.json', {})).toBe(
      'https://stocky.shopifyapps.com/api/v2/suppliers.json'
    );
  });
  it('appends only limit/since_id/updated_since/offset params, url-encoded', () => {
    expect(
      buildStockyUrl('purchase_orders.json', { limit: '250', since_id: '123', bogus: 'x' })
    ).toBe('https://stocky.shopifyapps.com/api/v2/purchase_orders.json?limit=250&since_id=123');
  });
});
