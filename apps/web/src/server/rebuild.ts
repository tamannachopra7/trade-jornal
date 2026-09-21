import { buildRoundTrips, type Execution, type ProfitCalcMethod } from "@luxalgo/journal-core";
import { getMultipliers, getJournalDefaults } from "./settings";
import { defaultRisk } from "@/lib/journal-defaults";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const rebuildAccount = async (accountId: string): Promise<void> => {
  const { databases } = createAdminClient();
  
  let account;
  try {
    account = await databases.getDocument(DATABASE_ID, 'accounts', accountId);
  } catch (e) {
    return;
  }

  // NOTE: This might need pagination for very large execution sets
  const execResponse = await databases.listDocuments(DATABASE_ID, 'executions', [
    Query.equal('accountId', accountId),
    Query.limit(5000)
  ]);
  
  const executionInputs: Execution[] = execResponse.documents.map((row) => ({
    id: row.$id,
    accountId: row.accountId,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    executedAt: row.executedAt,
    assetClass: (row.assetClass ?? undefined) as Execution["assetClass"],
    source: row.source,
    importMetadata: row.importMetadataJson ? JSON.parse(row.importMetadataJson) : undefined,
  }));

  const multipliers = await getMultipliers();
  const trips = buildRoundTrips(executionInputs, {
    method: account.profitCalcMethod as ProfitCalcMethod,
    multipliers,
  });

  const existingTradesResponse = await databases.listDocuments(DATABASE_ID, 'trades', [
    Query.equal('accountId', accountId),
    Query.limit(5000)
  ]);
  
  const obsolete = new Set(existingTradesResponse.documents.map((row) => row.$id));
  const defaults = await getJournalDefaults();

  for (const trip of trips) {
    obsolete.delete(trip.key);
    const computed = {
      accountId: trip.accountId,
      symbol: trip.symbol,
      assetClass: trip.assetClass ?? null,
      direction: trip.direction,
      status: trip.status,
      openedAt: trip.openedAt,
      closedAt: trip.closedAt ?? null,
      quantity: trip.quantity,
      openQuantity: trip.openQuantity,
      avgEntry: trip.avgEntry,
      avgExit: trip.avgExit ?? null,
      grossPnl: trip.grossPnl,
      fees: trip.fees,
      netPnl: trip.netPnl,
      executionCount: trip.executionCount,
      executionIdsJson: JSON.stringify(trip.executionIds),
      exitsJson: JSON.stringify(trip.exits),
      durationMs: trip.durationMs ?? null,
    };
    
    try {
      await databases.updateDocument(DATABASE_ID, 'trades', trip.key, computed);
    } catch (err: any) {
      if (err.code === 404) {
        // Doesn't exist, create it
        const defaultsToAdd = defaultRisk(trip.avgEntry, trip.direction, accountId, trip.symbol, defaults);
        await databases.createDocument(DATABASE_ID, 'trades', trip.key, {
          ...computed,
          ...defaultsToAdd
        });
      }
    }
  }

  const vanished = [...obsolete];
  for (const key of vanished) {
    try {
      await databases.deleteDocument(DATABASE_ID, 'trades', key);
    } catch (e) {
      // Ignore
    }
  }
};
