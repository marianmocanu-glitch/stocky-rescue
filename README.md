# Stocky Rescue

Free, open-source export tool for [Stocky](https://help.shopify.com/en/manual/products/inventory/stocky), which shuts down on **August 31, 2026**. Shopify's migration guide states suppliers can't be exported from Stocky's UI — but Stocky's read-only API exposes them. This tool downloads your suppliers, purchase-order history, stock adjustments and tax types as clean CSV files.

## Privacy model

- Your Stocky API key is **used only during the export and never stored or logged**. It transits our Cloudflare Worker relay (required because Stocky's API does not allow browser calls) in the request body, is forwarded to `stocky.shopifyapps.com`, and is gone when the request completes.
- The relay keeps **no databases and no logs of request contents**. Read `worker/src/` — it's ~150 lines.
- All exported data is assembled **in your browser's memory** and written straight to a ZIP on your disk. Nothing is persisted server-side.
- The only thing we keep is your email address, **if** you choose to leave it after the export (it goes to our mailing list provider).
- Analytics: anonymous counters only (export started/completed) — no store names, no data contents.

## Structure

- `worker/` — Cloudflare Worker: CORS relay to Stocky's API (path-whitelisted), mailing-list opt-in endpoint, anonymous event counter.
- `web/` — static site (Vite + vanilla TypeScript): export logic, CSV/ZIP generation, UI.

## Run locally

pnpm install, then `pnpm dev` in `worker/` (wrangler, port 8787) and in `web/` (Vite, port 5173).

## License

MIT
