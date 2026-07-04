import { handleProxy } from './proxy';
import { handleSubscribe, type SubscribeEnv } from './subscribe';

export interface Env extends SubscribeEnv {
  ALLOWED_ORIGINS: string; // comma-separated
  EVENTS?: { writeDataPoint(p: { blobs?: string[]; doubles?: number[] }): void };
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 360;
let buckets = new Map<string, { count: number; reset: number }>();

export function resetRateLimiter(): void {
  buckets = new Map();
}

function rateLimited(ip: string, now: number): boolean {
  const b = buckets.get(ip);
  if (!b || now > b.reset) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > MAX_PER_WINDOW;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  };
}

function withCors(res: Response, origin: string): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v as string);
  return out;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    if (!allowed.includes(origin)) return new Response('forbidden', { status: 403 });

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (req.method !== 'POST') return withCors(new Response('method not allowed', { status: 405 }), origin);

    const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (rateLimited(ip, Date.now())) {
      return withCors(new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }), origin);
    }

    const path = new URL(req.url).pathname;
    if (path === '/proxy') return withCors(await handleProxy(req, fetch), origin);
    if (path === '/subscribe') return withCors(await handleSubscribe(req, env, fetch), origin);
    if (path === '/event') {
      try {
        const { name } = (await req.json()) as { name?: string };
        const KNOWN = ['export_started', 'export_completed', 'email_optin'];
        if (name && KNOWN.includes(name) && env.EVENTS) env.EVENTS.writeDataPoint({ blobs: [name] });
      } catch {
        /* beacon is best-effort */
      }
      return withCors(new Response(null, { status: 204 }), origin);
    }
    return withCors(new Response('not found', { status: 404 }), origin);
  },
};
