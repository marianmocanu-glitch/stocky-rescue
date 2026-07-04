import { RESOURCES, fetchAll, StockyAuthError, type Creds } from './stocky';
import { toCsv, flattenPurchaseOrders } from './csv';

export interface ExportFile { name: string; content: string; }
export interface ExportResult { files: ExportFile[]; errors: string[]; counts: Record<string, number>; }

function columnsOf(rows: Record<string, unknown>[]): string[] {
  const cols = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) cols.add(k);
  return [...cols];
}

export async function runExport(
  creds: Creds,
  proxyUrl: string,
  onProgress: (resource: string, count: number) => void,
  fetcher: typeof fetch = fetch
): Promise<ExportResult> {
  const files: ExportFile[] = [];
  const errors: string[] = [];
  const counts: Record<string, number> = {};

  for (const def of RESOURCES) {
    try {
      const rows = await fetchAll(def, creds, proxyUrl, (n) => onProgress(def.name, n), fetcher);
      counts[def.name] = rows.length;
      if (def.name === 'purchase_orders') {
        const { orders, lineItems } = flattenPurchaseOrders(rows);
        files.push({ name: 'purchase_orders.csv', content: toCsv(orders, columnsOf(orders)) });
        files.push({ name: 'purchase_order_line_items.csv', content: toCsv(lineItems, columnsOf(lineItems)) });
      } else {
        files.push({ name: `${def.name}.csv`, content: toCsv(rows, columnsOf(rows)) });
      }
    } catch (e) {
      if (e instanceof StockyAuthError) throw e; // wrong key: abort the whole run
      errors.push(`${def.name}: ${(e as Error).message}`);
    }
  }
  return { files, errors, counts };
}
