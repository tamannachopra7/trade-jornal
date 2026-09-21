import { connect, listBrokers, type BrokerId } from "@luxalgo/broker-sdk";
import type { ImportedExecution } from "@luxalgo/journal-importers";
import { decryptJson, encryptJson } from "./crypto";
import { nowIso } from "./ids";
import { insertExecutions, type InsertResult } from "./executions";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

/** All broker connectivity goes through @luxalgo/broker-sdk, never direct API code. */
export { listBrokers };

export interface SyncOutcome extends InsertResult {
  accountId: string;
  equity: number | null;
  positions: number;
  syncedAt: string;
}

export const syncAccount = async (accountId: string): Promise<SyncOutcome> => {
  const { databases } = createAdminClient();
  let account;
  try {
    account = await databases.getDocument(DATABASE_ID, 'accounts', accountId);
  } catch {
    throw new Error("Account not found");
  }
  if (account.kind !== "sync" || !account.credentialsEnc) {
    throw new Error("Account is not broker-connected");
  }

  const credentials = decryptJson<Record<string, string>>(account.credentialsEnc);
  const connection = connect({
    broker: account.broker as BrokerId,
    credentials,
    // Some brokers rotate tokens on every fetch (Questrade): persist or die.
    onCredentialsRotated: async (next: Record<string, string>) => {
      await databases.updateDocument(DATABASE_ID, 'accounts', accountId, {
        credentialsEnc: encryptJson(next)
      });
    },
  } as Parameters<typeof connect>[0]);

  const snapshot = await connection.fetchSnapshot();
  const syncedAt = nowIso();

  const rows: ImportedExecution[] = snapshot.accounts.flatMap((brokerAccount) =>
    brokerAccount.trades.map((trade) => ({
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      fee: trade.fee ?? 0,
      executedAt: trade.executedAt ?? "",
    })),
  );
  const timed = rows.filter((row) => row.executedAt !== "");
  const untimed = rows.length - timed.length;

  const result = await insertExecutions(accountId, timed, "sync");
  if (untimed > 0) {
    result.skipped += untimed;
    if (result.skippedReasons.length < 5)
      result.skippedReasons.push(`${untimed} fill(s) had no usable timestamp.`);
  }

  const equity = snapshot.accounts.reduce((total, a) => total + a.equity, 0);
  const positions = snapshot.accounts.flatMap((a) => a.positions);
  
  await databases.updateDocument(DATABASE_ID, 'accounts', accountId, {
    lastSyncAt: syncedAt,
    snapshotJson: JSON.stringify({ equity, positions, fetchedAt: snapshot.fetchedAt }),
  });

  return { accountId, ...result, equity, positions: positions.length, syncedAt };
};
