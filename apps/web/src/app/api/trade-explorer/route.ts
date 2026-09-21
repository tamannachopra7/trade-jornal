import { readFilters } from "@luxalgo/journal-core";
import { tradeExplorerPoints } from "@/lib/trade-explorer";
import { handler, ok } from "@/server/api";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";
import { savedEstimates } from "@/server/market-data/estimates";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const { trades } = await queryTrades(readFilters(new URL(request.url).searchParams));
  const timeZone = await getTimeZone();
  
  const { databases } = createAdminClient();
  const accountsResponse = await databases.listDocuments(DATABASE_ID, 'accounts');
  
  const currencies = new Map(
    accountsResponse.documents.map((account) => [account.$id, account.currency]),
  );
  const estimates = await savedEstimates(trades);
  
  return ok({
    points: tradeExplorerPoints(trades, timeZone).map((point) => ({
      ...point,
      mae: estimates.get(point.key)?.estimate.mae ?? null,
      mfe: estimates.get(point.key)?.estimate.mfe ?? null,
    })),
    currencies: [
      ...new Set(
        trades
          .filter((trade) => trade.status !== "open" && trade.closedAt)
          .map((trade) => currencies.get(trade.accountId) ?? "USD"),
      ),
    ],
    timeZone,
  });
});
