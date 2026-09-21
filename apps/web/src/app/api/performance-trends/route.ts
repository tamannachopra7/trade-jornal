import { readFilters } from "@luxalgo/journal-core";
import { performanceTrends } from "@/lib/performance-trends";
import { handler, ok } from "@/server/api";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const { trades } = await queryTrades(readFilters(new URL(request.url).searchParams));
  
  const { databases } = createAdminClient();
  const accountsResponse = await databases.listDocuments(DATABASE_ID, 'accounts');
  
  const currencies = new Map(
    accountsResponse.documents.map((account) => [account.$id, account.currency]),
  );

  return ok({
    trends: performanceTrends(trades),
    currencies: [
      ...new Set(
        trades
          .filter((trade) => trade.status !== "open" && trade.closedAt)
          .map((trade) => currencies.get(trade.accountId) ?? "USD"),
      ),
    ],
    timeZone: await getTimeZone(),
  });
});
