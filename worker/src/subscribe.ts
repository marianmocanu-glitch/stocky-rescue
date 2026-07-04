export interface SubscribeEnv {
  BREVO_API_KEY: string;
  BREVO_LIST_ID: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function handleSubscribe(
  req: Request,
  env: SubscribeEnv,
  fetcher: typeof fetch
): Promise<Response> {
  let email = '';
  try {
    const body = (await req.json()) as { email?: string };
    email = (body.email ?? '').trim();
  } catch {
    /* falls through to validation */
  }
  if (!EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }
  try {
    const res = await fetcher('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email, listIds: [Number(env.BREVO_LIST_ID)], updateEnabled: true }),
    });
    if (res.status === 201 || res.status === 204) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'brevo_error' }), { status: 502, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'brevo_unreachable' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
}
