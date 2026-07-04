import { describe, it, expect } from 'vitest';
import { toCsv, flattenPurchaseOrders } from '../src/csv';

const BOM = '﻿';

describe('toCsv', () => {
  it('starts with UTF-8 BOM and header row', () => {
    const csv = toCsv([{ a: 1, b: 'x' }], ['a', 'b']);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(BOM + 'a,b\r\n1,x\r\n');
  });
  it('quotes fields containing commas, quotes and newlines per RFC 4180', () => {
    const csv = toCsv([{ a: 'he said "hi"', b: 'x,y', c: 'l1\nl2' }], ['a', 'b', 'c']);
    expect(csv).toBe(BOM + 'a,b,c\r\n"he said ""hi""","x,y","l1\nl2"\r\n');
  });
  it('renders null/undefined/missing as empty and keeps zeros', () => {
    const csv = toCsv([{ a: null, b: undefined, d: 0 }], ['a', 'b', 'c', 'd']);
    expect(csv).toBe(BOM + 'a,b,c,d\r\n,,,0\r\n');
  });
});

describe('flattenPurchaseOrders', () => {
  const po = {
    id: 10, number: 'PO-10', supplier_name: 'Acme', supplier_id: 5, currency: 'USD',
    paid: true, archived: false, created_at: '2026-01-01T00:00:00Z',
    purchase_items: [
      { id: 100, sku: 'SKU1', quantity: 3, cost_price: '2.50', product_title: 'Mug' },
      { id: 101, sku: 'SKU2', quantity: 1, cost_price: '9.00', product_title: 'Cap' },
    ],
  };
  it('splits orders from line items and joins by purchase_order_id', () => {
    const { orders, lineItems } = flattenPurchaseOrders([po as any]);
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(10);
    expect('purchase_items' in orders[0]).toBe(false);
    expect(lineItems).toHaveLength(2);
    expect(lineItems[0]).toMatchObject({ purchase_order_id: 10, purchase_order_number: 'PO-10', sku: 'SKU1' });
  });
  it('handles orders with no items', () => {
    const { orders, lineItems } = flattenPurchaseOrders([{ id: 1 } as any]);
    expect(orders).toHaveLength(1);
    expect(lineItems).toHaveLength(0);
  });
});
