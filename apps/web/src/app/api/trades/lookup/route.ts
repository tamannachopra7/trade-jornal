import { handler, ok } from "@/server/api";
import type { LinkableTrade } from "@/lib/trade-links";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const search = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const { databases } = createAdminClient();
  
  const tradesRes = await databases.listDocuments(DATABASE_ID, 'trades', [Query.limit(5000), Query.orderDesc('openedAt')]);
  const accRes = await databases.listDocuments(DATABASE_ID, 'accounts', [Query.limit(5000)]);
  const accounts = new Map(accRes.documents.map(a => [a.$id, a.name]));

  const matches: LinkableTrade[] = [];
  for (const trade of tradesRes.documents) {
    const accountName = accounts.get(trade.accountId) ?? 'Unknown account';
    if (!`${trade.symbol} ${trade.openedAt} ${accountName}`.toLowerCase().includes(search)) {
      continue;
    }
    matches.push({
      key: trade.$id,
      symbol: trade.symbol,
      direction: trade.direction,
      openedAt: trade.openedAt,
      accountName
    });
    if (matches.length === 51) break;
  }
  return ok({ trades: matches.slice(0, 50), hasMore: matches.length > 50 });
});
