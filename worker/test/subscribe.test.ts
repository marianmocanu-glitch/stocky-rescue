import { describe, it, expect, vi } from 'vitest';
import { handleSubscribe } from '../src/subscribe';

const ENV = { BREVO_API_KEY: 'brevo-secret', BREVO_LIST_ID: '7' };
function req(body: unknown): Request {
  return new Request('https://x/subscribe', { method: 'POST', body: JSON.stringify(body) });
}

describe('handleSubscribe', () => {
  it('posts contact to brevo with key header and list id, returns 200', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.brevo.com/v3/contacts');
      const h = new Headers(init?.headers);
      expect(h.get('api-key')).toBe('brevo-secret');
      expect(JSON.parse(String(init?.body))).toEqual({
        email: 'a@b.com',
        listIds: [7],
        updateEnabled: true,
      });
      return new Response('{}', { status: 201 });
    });
    const res = await handleSubscribe(req({ email: 'a@b.com' }), ENV, fetcher as typeof fetch);
    expect(res.status).toBe(200);
  });

  it('treats brevo 204 (already exists) as success', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const res = await handleSubscribe(req({ email: 'a@b.com' }), ENV, fetcher as typeof fetch);
    expect(res.status).toBe(200);
  });

  it('rejects invalid emails with 400 without calling brevo', async () => {
    const fetcher = vi.fn();
    const res = await handleSubscribe(req({ email: 'nope' }), ENV, fetcher as typeof fetch);
    expect(res.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps brevo failure to 502', async () => {
    const fetcher = vi.fn(async () => new Response('{"code":"x"}', { status: 500 }));
    const res = await handleSubscribe(req({ email: 'a@b.com' }), ENV, fetcher as typeof fetch);
    expect(res.status).toBe(502);
  });
});
