import { runExport, type ExportResult } from './exporter';
import { buildZipBlob } from './zipfile';

// Production serves the API same-origin via Pages Functions ('' → relative /proxy).
// Dev falls back to the standalone worker on :8787.
const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8787');
const PROXY_URL = `${WORKER_URL}/proxy`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function show(state: 'input' | 'progress' | 'done'): void {
  $('state-input').hidden = state !== 'input';
  $('state-progress').hidden = state !== 'progress';
  $('state-done').hidden = state !== 'done';
}

function beacon(name: string): void {
  fetch(`${WORKER_URL}/event`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => {});
}

let lastZipUrl: string | undefined;
const progressLines = new Map<string, HTMLLIElement>();
function onProgress(resource: string, count: number): void {
  let li = progressLines.get(resource);
  if (!li) {
    li = document.createElement('li');
    progressLines.set(resource, li);
    $('progress-list').appendChild(li);
  }
  li.textContent = `${resource.replace(/_/g, ' ')}: ${count}…`;
}

$('export-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const storeName = ($('store-name') as HTMLInputElement).value.trim();
  const apiKey = ($('api-key') as HTMLInputElement).value.trim();
  const errEl = $('input-error');
  errEl.hidden = true;
  $('done-errors').hidden = true;
  ($('rescue-btn') as HTMLButtonElement).disabled = true;
  progressLines.clear();
  $('progress-list').innerHTML = '';
  show('progress');
  beacon('export_started');
  try {
    const result: ExportResult = await runExport({ storeName, apiKey }, PROXY_URL, onProgress);
    const zip = await buildZipBlob(result.files, result.counts, result.errors, storeName);
    const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
    $('done-summary').textContent =
      `${result.files.length} files, ${total} records rescued from ${storeName}.`;
    if (result.errors.length > 0) {
      const de = $('done-errors');
      de.hidden = false;
      de.textContent = `Some resources failed (details in ERRORS.txt inside the ZIP): ${result.errors.join('; ')}`;
    }
    if (lastZipUrl) URL.revokeObjectURL(lastZipUrl);
    const url = URL.createObjectURL(zip);
    lastZipUrl = url;
    $('download-btn').onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `stocky-rescue-${storeName.replace('.myshopify.com', '')}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
    };
    show('done');
    beacon('export_completed');
  } catch (err) {
    show('input');
    errEl.hidden = false;
    errEl.textContent =
      err instanceof Error && /rejected/.test(err.message)
        ? 'Stocky rejected the store name or API key. Double-check both (the key is under Stocky → Preferences → API) and try again.'
        : `Export failed: ${(err as Error).message}. Your data is untouched — just retry.`;
  } finally {
    ($('rescue-btn') as HTMLButtonElement).disabled = false;
  }
});

$('optin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = ($('optin-email') as HTMLInputElement).value.trim();
  const msg = $('optin-msg');
  try {
    const res = await fetch(`${WORKER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    msg.hidden = false;
    msg.textContent = res.ok ? '✅ You are on the list — we will email you at launch.' : 'Something went wrong — try again?';
    if (res.ok) beacon('email_optin');
  } catch {
    msg.hidden = false;
    msg.textContent = 'Network error — try again?';
  }
});
