import { createHash } from "node:crypto";
import type { AnnotatedTrade } from "@luxalgo/journal-core";
import type { ExcursionEstimate, TradeMarketResult } from "@/lib/market-data";
import { listExecutions } from "@/server/executions";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

type FingerprintContext = {
  currencies: Map<string, string>;
  fills: Map<string, any>;
};

const chunks = <T>(items: T[], size = 100): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

export async function estimateFingerprint(trade: AnnotatedTrade, context?: FingerprintContext): Promise<string> {
  const { databases } = createAdminClient();
  let currency = "USD";
  
  if (context) {
    currency = context.currencies.get(trade.accountId) || "USD";
  } else {
    try {
      const acc = await databases.getDocument(DATABASE_ID, 'accounts', trade.accountId);
      currency = acc.currency ?? "USD";
    } catch {
      // ignore
    }
  }

  const fills = trade.executionIds.length
    ? (context
        ? [...new Set(trade.executionIds)].flatMap((id) => {
            const fill = context.fills.get(id);
            return fill?.accountId === trade.accountId ? [fill] : [];
          })
        : await listExecutions(trade.accountId, trade.executionIds)
      )
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, side, quantity, price, executedAt }) => ({
          id,
          side,
          quantity,
          price,
          executedAt,
        }))
    : [];
    
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        accountId: trade.accountId,
        symbol: trade.symbol,
        direction: trade.direction,
        openedAt: trade.openedAt,
        closedAt: trade.closedAt,
        assetClass: trade.assetClass,
        multiplier: trade.contractMultiplier ?? null,
        currency,
        fills,
      }),
    )
    .digest("hex");
}

export async function saveEstimate(
  trade: AnnotatedTrade,
  history: TradeMarketResult,
  fingerprint: string,
) {
  if (history.estimate.mae === null || history.estimate.mfe === null) return;
  if ((await estimateFingerprint(trade)) !== fingerprint) return;
  
  const { databases } = createAdminClient();
  if (history.datasetId) {
    try {
      await databases.getDocument(DATABASE_ID, 'marketCsvDatasets', history.datasetId);
    } catch {
      return;
    }
  }
  
  const values = {
    tradeKey: trade.key,
    fingerprint,
    provider: history.provider,
    symbol: history.symbol,
    resolution: history.resolution,
    fetchedAt: history.fetchedAt,
    estimateJson: JSON.stringify({ ...history.estimate, datasetId: history.datasetId }),
  };
  
  try {
    const existing = await databases.listDocuments(DATABASE_ID, 'tradeExcursions', [
      Query.equal('tradeKey', trade.key)
    ]);
    if (existing.total > 0) {
      await databases.updateDocument(DATABASE_ID, 'tradeExcursions', existing.documents[0]?.$id as string, values);
    } else {
      await databases.createDocument(DATABASE_ID, 'tradeExcursions', 'unique()', values);
    }
  } catch (err) {
    // Ignore
  }
}

export async function savedEstimates(trades: AnnotatedTrade[]) {
  const { databases } = createAdminClient();
  const keys = trades.map(t => t.key);
  
  const stored = new Map();
  if (keys.length > 0) {
    for (const chunk of chunks(keys)) {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'tradeExcursions', [
          Query.equal('tradeKey', chunk)
        ]);
        for (const doc of res.documents) {
          stored.set(doc.tradeKey, doc);
        }
      } catch {
        // collection might not exist
      }
    }
  }

  const relevant = trades.filter((trade) => stored.has(trade.key));
  const accountIds = [...new Set(relevant.map((trade) => trade.accountId))];
  const executionIds = [...new Set(relevant.flatMap((trade) => trade.executionIds))];
  
  const currenciesMap = new Map();
  if (accountIds.length > 0) {
    for (const chunk of chunks(accountIds)) {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'accounts', [
          Query.equal('$id', chunk)
        ]);
        for (const doc of res.documents) currenciesMap.set(doc.$id, doc.currency);
      } catch {}
    }
  }
  
  const fillsMap = new Map();
  if (executionIds.length > 0) {
    for (const chunk of chunks(executionIds)) {
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'executions', [
          Query.equal('$id', chunk)
        ]);
        for (const doc of res.documents) {
          fillsMap.set(doc.$id, { ...doc, id: doc.$id });
        }
      } catch {}
    }
  }
  
  const context: FingerprintContext = {
    currencies: currenciesMap,
    fills: fillsMap,
  };
  
  const datasetIds = new Set();
  try {
    const dRes = await databases.listDocuments(DATABASE_ID, 'marketCsvDatasets');
    for (const d of dRes.documents) datasetIds.add(d.$id);
  } catch {}

  const result = new Map();
  for (const trade of trades) {
    const row = stored.get(trade.key);
    if (!row || row.fingerprint !== (await estimateFingerprint(trade, context))) continue;
    const estimate = JSON.parse(row.estimateJson) as ExcursionEstimate & { datasetId?: string };
    if (estimate.datasetId && !datasetIds.has(estimate.datasetId)) continue;
    if (
      estimate.mae === null ||
      estimate.mfe === null ||
      !Number.isFinite(estimate.mae) ||
      !Number.isFinite(estimate.mfe)
    )
      continue;
      
    result.set(trade.key, {
      estimate,
      provider: row.provider,
      symbol: row.symbol,
      resolution: row.resolution,
      fetchedAt: row.fetchedAt,
    });
  }
  return result;
}
