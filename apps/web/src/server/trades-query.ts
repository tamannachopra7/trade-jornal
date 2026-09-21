import { matchesFilters, type AnalysisFilters, type AnnotatedTrade } from "@luxalgo/journal-core";
import { getTimeZone, getMultipliers, getJournalDefaults } from "./settings";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export type TradeFilters = AnalysisFilters & { accountIds?: string[] };

export type TradeRow = {
  key: string;
  accountId: string;
  symbol: string;
  assetClass: string | null;
  direction: "long" | "short";
  status: "open" | "win" | "loss" | "breakeven";
  openedAt: string;
  closedAt: string | null;
  quantity: number;
  openQuantity: number;
  avgEntry: number;
  avgExit: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  executionCount: number;
  executionIdsJson: string;
  exitsJson: string;
  durationMs: number | null;
  tagsJson: string | null;
  mistakesJson: string | null;
  playbookId: string | null;
  rating: number | null;
  stopLoss: number | null;
  profitTarget: number | null;
  reviewedAt: string | null;
  notes?: string | null;
};

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
};

export const getTradeContext = async () => ({ multipliers: await getMultipliers(), defaults: await getJournalDefaults() });

export const rowToTrade = (row: TradeRow, config: { multipliers: Record<string, number>, defaults: any }): AnnotatedTrade => {
  const multiplier = config.multipliers[row.symbol];
  const defaults = config.defaults;
  const missingMultiplier =
    multiplier == null && ["futures", "option", "forex", "cfd"].includes(row.assetClass ?? "");
  const notional = missingMultiplier
    ? 0
    : Math.abs(row.avgEntry * row.quantity * (multiplier ?? 1));
  const tolerance =
    defaults.breakevenMode === "percent"
      ? (notional * defaults.breakeven) / 100
      : defaults.breakeven;
  const status =
    row.status === "open"
      ? "open"
      : Math.abs(row.netPnl) <= Math.max(1e-9, tolerance)
        ? "breakeven"
        : row.netPnl > 0
          ? "win"
          : "loss";
  return {
    key: row.key,
    accountId: row.accountId,
    symbol: row.symbol,
    assetClass: (row.assetClass ?? undefined) as AnnotatedTrade["assetClass"],
    direction: row.direction,
    status,
    contractMultiplier: multiplier,
    openedAt: row.openedAt,
    closedAt: row.closedAt ?? undefined,
    quantity: row.quantity,
    openQuantity: row.openQuantity,
    avgEntry: row.avgEntry,
    avgExit: row.avgExit ?? undefined,
    grossPnl: row.grossPnl,
    fees: row.fees,
    netPnl: row.netPnl,
    executionCount: row.executionCount,
    executionIds: parseJsonArray(row.executionIdsJson),
    exits: JSON.parse(row.exitsJson) as AnnotatedTrade["exits"],
    durationMs: row.durationMs ?? undefined,
    annotations: {
      tags: parseJsonArray(row.tagsJson),
      mistakes: parseJsonArray(row.mistakesJson),
      playbook: row.playbookId ?? undefined,
      rating: row.rating ?? undefined,
      stopLoss: row.stopLoss ?? undefined,
      profitTarget: row.profitTarget ?? undefined,
      reviewed: row.reviewedAt !== null,
    },
  };
};

export const queryTrades = async (
  filters: TradeFilters = {},
): Promise<{ rows: TradeRow[]; trades: AnnotatedTrade[] }> => {
  const effective = { ...filters, accounts: filters.accounts ?? filters.accountIds?.join(",") };
  const accountIds = effective.accounts
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const { databases } = createAdminClient();
  const queries = [];
  
  if (effective.playbookId) queries.push(Query.equal('playbookId', effective.playbookId));
  if (effective.direction) queries.push(Query.equal('direction', effective.direction as string));
  if (effective.assetClass) queries.push(Query.equal('assetClass', effective.assetClass));
  // Appwrite limits: we can't easily do `inArray` if accountIds is large without multiple queries.
  // For small lists, we can use Query.equal('accountId', accountIds) which acts as IN.
  if (accountIds && accountIds.length > 0) {
    queries.push(Query.equal('accountId', accountIds));
  }
  
  // NOTE: This might need pagination for very large journals
  queries.push(Query.limit(5000));
  queries.push(Query.orderAsc('openedAt'));
  
  const response = await databases.listDocuments(DATABASE_ID, 'trades', queries);
  const all = response.documents.map(doc => {
    const { $id, ...rest } = doc;
    return { ...rest, key: $id } as unknown as TradeRow;
  });

  const timeZone = await getTimeZone();
  const config = await getTradeContext();
  
  const pairs = all
    .map((row) => ({ row, trade: rowToTrade(row, config) }))
    .filter(({ trade }) => matchesFilters(trade, effective, timeZone));
    
  return {
    rows: pairs.map(({ row, trade }) => ({ ...row, status: trade.status })),
    trades: pairs.map((p) => p.trade),
  };
};

export const getTradeByKey = async (key: string): Promise<TradeRow | undefined> => {
  const { databases } = createAdminClient();
  try {
    const doc = await databases.getDocument(DATABASE_ID, 'trades', key);
    const { $id, ...rest } = doc;
    return { ...rest, key: $id } as unknown as TradeRow;
  } catch {
    return undefined;
  }
};

