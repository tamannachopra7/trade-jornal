import { randomUUID } from "node:crypto";
import { RESOLUTIONS, type MarketBar, type Resolution } from "@/lib/market-data";
import { parseMarketCsv, type MarketCsvDataset } from "@/lib/market-csv";
import { MarketDataError, type MarketDataProvider } from "./provider";
import { result } from "./http";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

// Immutable datasets; keep at most 200,000 decoded bars across files.
const decoded = new Map<string, MarketBar[]>();
let decodedCount = 0;
async function datasetBars(id: string) {
  const cached = decoded.get(id);
  if (cached) {
    decoded.delete(id);
    decoded.set(id, cached);
    return cached;
  }
  const { databases } = createAdminClient();
  let row;
  try {
    row = await databases.getDocument(DATABASE_ID, 'marketCsvDatasets', id);
  } catch {
    throw new MarketDataError("CSV dataset was removed.");
  }
  const bars = JSON.parse(row.barsJson) as MarketBar[];
  decoded.set(id, bars);
  decodedCount += bars.length;
  while (decodedCount > 200_000) {
    const oldest = decoded.keys().next().value!;
    decodedCount -= decoded.get(oldest)!.length;
    decoded.delete(oldest);
  }
  return bars;
}
function lowerBound(bars: MarketBar[], time: number) {
  let lo = 0,
    hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid]!.time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export async function csvDatasets(): Promise<MarketCsvDataset[]> {
  const { databases } = createAdminClient();
  const res = await databases.listDocuments(DATABASE_ID, 'marketCsvDatasets', [Query.limit(5000)]);
  return res.documents.map(({ firstTime, lastTime, ...row }) => ({
    id: row.$id,
    name: row.name,
    symbol: row.symbol,
    resolution: row.resolution as Resolution,
    currency: row.currency,
    priceBasis: row.priceBasis,
    importedAt: row.importedAt,
    count: row.barCount,
    firstTime,
    lastTime,
    from: new Date(firstTime).toISOString(),
    to: new Date(lastTime + RESOLUTIONS[row.resolution as Resolution]).toISOString(),
  }));
}
export async function importCsvDataset(input: {
  name: string;
  symbol: string;
  resolution: Resolution;
  currency: string;
  priceBasis: string;
  content: string;
}) {
  const bars = parseMarketCsv(input.content, input.symbol, input.resolution);
  const { databases } = createAdminClient();
  const existing = await databases.listDocuments(DATABASE_ID, 'marketCsvDatasets', [Query.limit(5000)]);
  if (existing.documents.length >= 50)
    throw new MarketDataError("Remove an unused dataset before adding more (50-file limit).");
  const { name, symbol, resolution, currency, priceBasis } = input;
  const metadata = { name, symbol, resolution, currency, priceBasis };
  const id = randomUUID();
  await databases.createDocument(DATABASE_ID, 'marketCsvDatasets', id, {
    ...metadata,
    importedAt: new Date().toISOString(),
    barsJson: JSON.stringify(bars),
    barCount: bars.length,
    firstTime: bars[0]!.time,
    lastTime: bars.at(-1)!.time,
  });
  return id;
}
export async function removeCsvDataset(id: string) {
  const { databases } = createAdminClient();
  try { await databases.deleteDocument(DATABASE_ID, 'marketCsvDatasets', id); } catch {}
  // the trade excursions cleanup won't work perfectly in Appwrite without a full scan
  // but trade_excursions were moved or deleted mostly anyway
  
  const bars = decoded.get(id);
  if (bars) {
    decodedCount -= bars.length;
    decoded.delete(id);
  }
}
export const marketCsv: MarketDataProvider = {
  id: "market-csv",
  name: "Market data CSV",
  environmentKey: "",
  async test() {
    if (!(await csvDatasets()).length)
      throw new MarketDataError("Upload market candles in Settings first.");
  },
  async history(request) {
    const { databases } = createAdminClient();
    const queries = [
      Query.equal('symbol', request.symbol),
      Query.equal('resolution', request.resolution),
      Query.limit(5000)
    ];
    if (request.dataset) queries.push(Query.equal('$id', request.dataset));
    
    const res = await databases.listDocuments(DATABASE_ID, 'marketCsvDatasets', queries);
    const candidates = res.documents;
    
    const covering = candidates.filter(
      (row) =>
        row.firstTime <= request.from &&
        row.lastTime + RESOLUTIONS[request.resolution] >= request.to,
    );
    const choices = request.dataset ? candidates : covering.length ? covering : candidates;
    if (!choices.length)
      throw new MarketDataError(
        "No CSV dataset matches this symbol and resolution. Upload candles in Settings.",
      );
    if (choices.length > 1)
      throw new MarketDataError(
        "More than one CSV dataset matches. Select the dataset on this trade.",
      );
    const row = choices[0]!;
    const bars = await datasetBars(row.$id);
    const start = lowerBound(bars, request.from - RESOLUTIONS[request.resolution] + 1);
    const end = lowerBound(bars, request.to);
    return {
      ...result(
        this.name,
        request,
        bars.slice(start, end),
        false,
        [
          `Local file: ${row.name}. Price basis: ${row.priceBasis}. Volume may be omitted; only supplied candles are used.`,
        ],
        row.currency,
      ),
      datasetId: row.$id,
    };
  },
};
