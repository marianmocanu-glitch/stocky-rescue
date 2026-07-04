import { isAllowedPath, buildStockyUrl } from './whitelist';

export interface ProxyBody {
  storeName: string;
  apiKey: string;
  path: string;
  params?: Record<string, string>;
}

function bad(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleProxy(req: Request, fetcher: typeof fetch): Promise<Response> {
  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return bad('invalid_json');
  }
  if (typeof body.storeName !== 'string' || !body.storeName.endsWith('.myshopify.com')) {
    return bad('invalid_store_name');
  }
  if (typeof body.apiKey !== 'string' || body.apiKey.length === 0) return bad('missing_api_key');
  if (typeof body.path !== 'string' || !isAllowedPath(body.path)) return bad('path_not_allowed');

  const url = buildStockyUrl(body.path, body.params ?? {});
  try {
    const upstream = await fetcher(url, {
      method: 'GET',
      headers: {
        'Store-Name': body.storeName,
        Authorization: `API KEY=${body.apiKey}`,
        Accept: 'application/json',
      },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'upstream_unreachable' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
