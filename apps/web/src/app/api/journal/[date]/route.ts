import { readFilters } from "@luxalgo/journal-core";
import { computeMetrics, dayKeyOf, intradayCurve } from "@luxalgo/journal-core";
import { bad, handler, ok } from "@/server/api";
import { nowIso } from "@/server/ids";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

type Params = { params: Promise<{ date: string }> };

export const GET = handler(async (request: Request, { params }: Params) => {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  const url = new URL(request.url);
  const timeZone = await getTimeZone();

  const { rows, trades } = await queryTrades(readFilters(url.searchParams));
  const dayTradeIndexes = trades
    .map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => trade.closedAt && dayKeyOf(trade.closedAt, timeZone) === date);
  const dayTrades = dayTradeIndexes.map(({ trade }) => trade);

  const { databases } = createAdminClient();
  const times = new Map<string, string>();
  
  for (const accountId of new Set(dayTrades.map((trade) => trade.accountId))) {
    const fillsResponse = await databases.listDocuments(DATABASE_ID, 'executions', [
      Query.equal('accountId', accountId),
      Query.limit(5000)
    ]);
    for (const fill of fillsResponse.documents) times.set(fill.$id, fill.executedAt);
  }

  let note = "";
  try {
    const docResponse = await databases.listDocuments(DATABASE_ID, 'journalDays', [
      Query.equal('date', date)
    ]);
    if (docResponse.documents.length > 0) note = docResponse.documents[0]?.note ?? "";
  } catch {
    // collection might not exist
  }

  return ok({
    date,
    metrics: computeMetrics(dayTrades, { timeZone }),
    trades: dayTradeIndexes.map(({ index }) => rows[index]),
    intraday: intradayCurve(dayTrades, times, date, timeZone),
    note,
  });
});

export const PUT = handler(async (request: Request, { params }: Params) => {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");
  const { note } = (await request.json()) as { note?: string };
  
  const { databases } = createAdminClient();
  try {
    const existing = await databases.listDocuments(DATABASE_ID, 'journalDays', [
      Query.equal('date', date)
    ]);
    
    if (existing.total > 0) {
      await databases.updateDocument(DATABASE_ID, 'journalDays', existing.documents[0]?.$id as string, {
        note: note ?? "",
        updatedAt: nowIso()
      });
    } else {
      await databases.createDocument(DATABASE_ID, 'journalDays', 'unique()', {
        date,
        note: note ?? "",
        updatedAt: nowIso()
      });
    }
  } catch (err: any) {
     return bad("Failed to update journal day");
  }
  
  return ok({ saved: true });
});
