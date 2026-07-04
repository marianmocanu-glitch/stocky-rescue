import { describe, it, expect } from 'vitest';
import { buildReadme, buildErrorsFile } from '../src/zipfile';

describe('buildReadme', () => {
  it('lists files with counts and the deadline warning', () => {
    const txt = buildReadme({ suppliers: 12, purchase_orders: 340 }, 'demo.myshopify.com');
    expect(txt).toContain('demo.myshopify.com');
    expect(txt).toContain('suppliers.csv (12 rows)');
    expect(txt).toContain('purchase_orders.csv (340 rows)');
    expect(txt).toContain('August 31, 2026');
  });
});

describe('buildErrorsFile', () => {
  it('returns null when there are no errors', () => {
    expect(buildErrorsFile([])).toBeNull();
  });
  it('lists errors with retry advice', () => {
    const txt = buildErrorsFile(['stock_adjustments: Stocky returned HTTP 404'])!;
    expect(txt).toContain('stock_adjustments');
    expect(txt).toContain('retry');
  });
});
