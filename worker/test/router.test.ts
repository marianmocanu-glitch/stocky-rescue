import { describe, it, expect, vi } from 'vitest';
import worker, { resetRateLimiter } from '../src/index';

const ENV = {
  ALLOWED_ORIGINS: 'https://stocky-rescue.pages.dev,http://localhost:5173',
  BREVO_API_KEY: 'k',
  BREVO_LIST_ID: '1',
} as any;

function post(path: string, body: unknown, origin = 'https://stocky-rescue.pages.dev', ip = '1.2.3.4') {
  return new Request(`https://worker.example${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'CF-Connecting-IP': ip, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('router', () => {
  it('answers OPTIONS preflight with CORS headers for allowed origin', async () => {
    resetRateLimiter();
    const req = new Request('https://worker.example/proxy', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    const res = await worker.fetch(req, ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects disallowed origins with 403', async () => {
    resetRateLimiter();
    const res = await worker.fetch(post('/proxy', {}, 'https://evil.example'), ENV);
    expect(res.status).toBe(403);
  });

  it('routes unknown paths to 404', async () => {
    resetRateLimiter();
    const res = await worker.fetch(post('/nope', {}), ENV);
    expect(res.status).toBe(404);
  });

  it('adds CORS headers to routed responses', async () => {
    resetRateLimiter();
    const res = await worker.fetch(post('/event', { name: 'export_started' }), ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://stocky-rescue.pages.dev');
  });

  it('rate limits after 360 requests/min per IP with 429', async () => {
    resetRateLimiter();
    let last: Response | undefined;
    for (let i = 0; i < 361; i++) {
      last = await worker.fetch(post('/event', { name: 'x' }, undefined, '9.9.9.9'), ENV);
    }
    expect(last!.status).toBe(429);
  });
});
