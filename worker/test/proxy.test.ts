import { describe, it, expect, vi } from 'vitest';
import { handleProxy } from '../src/proxy';

function req(body: unknown): Request {
  return new Request('https://x/proxy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const GOOD = { storeName: 'demo.myshopify.com', apiKey: 'k123', path: 'suppliers.json', params: { limit: '250' } };

describe('handleProxy', () => {
  it('forwards to stocky with auth headers and returns upstream json + status', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://stocky.shopifyapps.com/api/v2/suppliers.json?limit=250');
      const h = new Headers(init?.headers);
      expect(h.get('Store-Name')).toBe('demo.myshopify.com');
      expect(h.get('Authorization')).toBe('API KEY=k123');
      return new Response(JSON.stringify({ suppliers: [{ id: 1 }] }), { status: 200 });
    });
    const res = await handleProxy(req(GOOD), fetcher as typeof fetch);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suppliers: [{ id: 1 }] });
  });

  it('passes through upstream error statuses (401)', async () => {
    const fetcher = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const res = await handleProxy(req(GOOD), fetcher as typeof fetch);
    expect(res.status).toBe(401);
  });

  it('rejects non-whitelisted paths with 400 and never calls upstream', async () => {
    const fetcher = vi.fn();
    const res = await handleProxy(req({ ...GOOD, path: 'admin/users.json' }), fetcher as typeof fetch);
    expect(res.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects store names not ending in .myshopify.com with 400', async () => {
    const fetcher = vi.fn();
    const res = await handleProxy(req({ ...GOOD, storeName: 'evil.example.com' }), fetcher as typeof fetch);
    expect(res.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects malformed json body with 400', async () => {
    const bad = new Request('https://x/proxy', { method: 'POST', body: 'not-json' });
    const res = await handleProxy(bad, vi.fn() as unknown as typeof fetch);
    expect(res.status).toBe(400);
  });

  it('maps upstream network failure to 502 with machine-readable code', async () => {
    const fetcher = vi.fn(async () => { throw new Error('boom'); });
    const res = await handleProxy(req(GOOD), fetcher as typeof fetch);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_unreachable' });
  });
});
