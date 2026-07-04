import router, { type Env as RouterEnv } from './index';

export interface Env extends RouterEnv {
  ASSETS: { fetch: typeof fetch };
}

const API_PATHS = ['/proxy', '/subscribe', '/event'];

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (API_PATHS.includes(pathname)) return router.fetch(req, env);
    return env.ASSETS.fetch(req);
  },
};
