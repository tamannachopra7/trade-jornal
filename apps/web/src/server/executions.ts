import type { ImportedExecution } from "@luxalgo/journal-importers";
import { executionHash, newId, nowIso } from "./ids";
import { rebuildAccount } from "./rebuild";
import { getJournalDefaults } from "./settings";
import { defaultFee } from "@/lib/journal-defaults";
import { requireValue } from "./api";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export interface InsertResult {
  inserted: number;
  duplicates: number;
  skipped: number;
  skippedReasons: string[];
}

export type ExecutionSource = "sync" | "import" | "manual";

const MAX_SKIP_REASONS = 5;

const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export const executionProblem = (row: unknown, source: ExecutionSource): string | null => {
  if (!row || typeof row !== "object") return "Execution is missing.";
  const r = row as Partial<ImportedExecution>;
  const label = typeof r.symbol === "string" && r.symbol.trim() ? r.symbol.trim() : "execution";
  if (typeof r.symbol !== "string" || !r.symbol.trim()) return "An execution has no symbol.";
  if (!["buy", "sell"].includes(r.side as string)) return `${label}: side must be buy or sell.`;
  if (!isFiniteNumber(r.quantity) || r.quantity <= 0)
    return `${label}: quantity must be a finite positive number.`;
  if (!isFiniteNumber(r.price)) return `${label}: price must be a finite number.`;
  if (!isFiniteNumber(r.fee ?? 0)) return `${label}: fee must be a finite number.`;
  if (typeof r.executedAt !== "string" || !Number.isFinite(Date.parse(r.executedAt)))
    return `${label}: timestamp is missing or invalid.`;
  const meta = r.importMetadata;
  const metaOk =
    !meta ||
    (source === "import" &&
      typeof meta.id === "string" &&
      meta.id.length > 0 &&
      meta.id.length <= 2000 &&
      (meta.group === undefined ||
        (typeof meta.group === "string" && meta.group.length > 0 && meta.group.length <= 2000)) &&
      Number.isSafeInteger(meta.order) &&
      meta.order >= 0 &&
      (meta.reportedGrossPnl === undefined || Number.isFinite(meta.reportedGrossPnl)) &&
      (meta.preserveFee === undefined || typeof meta.preserveFee === "boolean"));
  if (!metaOk) return `${label}: invalid imported execution metadata.`;
  return null;
};

export const partitionExecutions = (
  rows: ImportedExecution[],
  source: ExecutionSource,
): { usable: ImportedExecution[]; skipped: number; skippedReasons: string[] } => {
  const usable: ImportedExecution[] = [];
  const skippedReasons: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    const problem = executionProblem(row, source);
    if (problem === null) {
      usable.push(row);
      continue;
    }
    if (source === "manual") {
      requireValue(
        false,
        "Every execution needs a symbol, buy/sell side, finite positive quantity, price, fee and valid timestamp.",
      );
    }
    skipped++;
    if (skippedReasons.length < MAX_SKIP_REASONS) skippedReasons.push(problem);
  }
  return { usable, skipped, skippedReasons };
};

export const insertExecutions = async (
  accountId: string,
  rows: ImportedExecution[],
  source: ExecutionSource,
  manualNotes?: string,
): Promise<InsertResult> => {
  requireValue(
    manualNotes === undefined ||
      (source === "manual" && typeof manualNotes === "string" && manualNotes.length <= 100000),
    "Manual trade notes must be at most 100,000 characters.",
  );

  const { databases } = createAdminClient();
  
  try {
    await databases.getDocument(DATABASE_ID, 'accounts', accountId);
  } catch (e) {
    requireValue(false, "Account not found.");
  }

  const { usable, skipped, skippedReasons } = partitionExecutions(rows, source);
  let inserted = 0;
  let duplicates = 0;
  const createdAt = nowIso();
  const defaults = await getJournalDefaults();
  const note = manualNotes?.trim() ? manualNotes : undefined;
  const noteExecutionIds = new Set<string>();

  for (const row of usable) {
    const id = newId();
    const contentHash = executionHash(row);

    try {
      // Check for duplicates
      const existing = await databases.listDocuments(DATABASE_ID, 'executions', [
        Query.equal('accountId', accountId),
        Query.equal('contentHash', contentHash)
      ]);

      if (existing.total > 0) {
        duplicates++;
        if (note) noteExecutionIds.add(existing.documents[0]?.$id as string);
        continue;
      }

      await databases.createDocument(DATABASE_ID, 'executions', id, {
        accountId,
        symbol: row.symbol,
        side: row.side,
        quantity: row.quantity,
        price: row.price,
        fee: row.importMetadata?.preserveFee
          ? row.fee
          : defaultFee(row.fee, row.quantity, accountId, row.symbol, defaults),
        executedAt: row.executedAt,
        assetClass: row.assetClass ?? null,
        source,
        importMetadataJson: row.importMetadata ? JSON.stringify(row.importMetadata) : null,
        contentHash,
        createdAt,
      });
      inserted++;
      if (note) noteExecutionIds.add(id);
    } catch (err) {
      console.error("Failed to insert execution", err);
    }
  }

  if (inserted > 0) await rebuildAccount(accountId);

  if (note) {
    const affected = await databases.listDocuments(DATABASE_ID, 'trades', [
      Query.equal('accountId', accountId)
    ]);

    for (const trade of affected.documents) {
      const ids = JSON.parse(trade.executionIdsJson) as string[];
      if (!ids.some((id) => noteExecutionIds.has(id))) continue;
      
      if (trade.notes === note || trade.notes?.endsWith(`\n\n${note}`)) continue;
      const notes = trade.notes?.trim() ? `${trade.notes}\n\n${note}` : note;
      requireValue(
        notes.length <= 100000,
        "Combined trade notes must be at most 100,000 characters.",
      );

      await databases.updateDocument(DATABASE_ID, 'trades', trade.$id, { notes });
    }
  }

  return { inserted, duplicates, skipped, skippedReasons };
};

export const deleteExecutionsForTrades = async (accountId: string, executionIds: string[]): Promise<void> => {
  if (executionIds.length === 0) return;
  const { databases } = createAdminClient();

  for (const id of executionIds) {
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'executions', id);
      if (doc.accountId === accountId) {
        await databases.deleteDocument(DATABASE_ID, 'executions', id);
      }
    } catch (e) {
      // Ignore if not found
    }
  }
  await rebuildAccount(accountId);
};

export type ExecutionRow = {
  id: string;
  accountId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  executedAt: string;
  assetClass: string | null;
  source: ExecutionSource;
  importMetadataJson: string | null;
  contentHash: string;
  createdAt: string;
};

export const listExecutions = async (accountId: string, ids?: string[]): Promise<ExecutionRow[]> => {
  const { databases } = createAdminClient();
  const queries = [Query.equal('accountId', accountId)];
  // Appwrite doesn't natively support "IN" queries cleanly for very large lists, 
  // but for small lists we can combine OR queries or just fetch and filter.
  // We'll fetch all for the account and filter in memory as a safe fallback.
  
  // NOTE: This might need pagination for huge accounts
  const response = await databases.listDocuments(DATABASE_ID, 'executions', queries);
  let results = response.documents;
  
  if (ids && ids.length > 0) {
    const idSet = new Set(ids);
    results = results.filter(doc => idSet.has(doc.$id));
  }
  
  return results.map(doc => {
    const { $id, ...rest } = doc;
    return { ...rest, id: $id } as unknown as ExecutionRow;
  });
};
