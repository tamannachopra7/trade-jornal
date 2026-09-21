import { calendarMonthFromDays, dailyStats, dayKeyOf, readFilters } from "@luxalgo/journal-core";
import { handler, ok, requireValue } from "@/server/api";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";
import { calendarInsights, calendarScope } from "@/lib/calendar-insights";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

/** Only compute the visible month, not every dashboard/report breakdown. */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const timeZone = await getTimeZone();
  const today = dayKeyOf(new Date().toISOString(), timeZone);
  const year = Number(params.get("calYear") ?? today.slice(0, 4));
  const month = Number(params.get("calMonth") ?? today.slice(5, 7));
  requireValue(
    Number.isInteger(year) &&
      year >= 1900 &&
      year <= 9999 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12,
    "Choose a valid calendar month.",
  );
  
  const scope = calendarScope(readFilters(params), year, month);
  const { trades } = await queryTrades(scope);
  const calendar = calendarMonthFromDays(dailyStats(trades, timeZone), year, month);
  
  const { databases } = createAdminClient();
  const accountsResponse = await databases.listDocuments(DATABASE_ID, 'accounts');
  const accountRows = accountsResponse.documents;
  
  const currencyByAccount = new Map(accountRows.map((account) => [account.$id, account.currency]));
  const currencies = [
    ...new Set(
      trades
        .filter((trade) => trade.status !== "open" && trade.closedAt)
        .map((trade) => currencyByAccount.get(trade.accountId) ?? "USD"),
    ),
  ].sort();
  
  if (!currencies.length) {
    const selectedIds = scope.accounts?.split(",").map((id) => id.trim());
    currencies.push(
      ...new Set(
        accountRows
          .filter((account) => !selectedIds || selectedIds.includes(account.$id))
          .map((account) => account.currency),
      ),
    );
    currencies.sort();
  }
  
  return ok({ calendar, insights: calendarInsights(calendar), timeZone, currencies, scope });
});
