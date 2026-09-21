import { readFilters } from "@luxalgo/journal-core";
import { dailyStats } from "@luxalgo/journal-core";
import { handler, ok } from "@/server/api";
import { getTimeZone } from "@/server/settings";
import { queryTrades } from "@/server/trades-query";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const timeZone = await getTimeZone();
  const { trades } = await queryTrades(readFilters(url.searchParams));

  const tradeDays = new Map(dailyStats(trades, timeZone).map((day) => [day.date, day]));
  
  const { databases } = createAdminClient();
  let noteRows: any[] = [];
  try {
    const response = await databases.listDocuments(DATABASE_ID, 'journalDays', [
      Query.orderDesc('date'),
      Query.limit(5000)
    ]);
    noteRows = response.documents;
  } catch {
    // journalDays collection might not exist yet
  }
  
  const noteDays = new Map(noteRows.map((row) => [row.date, row]));

  const filters = readFilters(url.searchParams);
  const allDates = [...new Set([...tradeDays.keys(), ...noteDays.keys()])]
    .filter(
      (date) => (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to),
    )
    .sort()
    .reverse();
    
  return ok({
    days: allDates.map((date) => ({
      date,
      stats: tradeDays.get(date) ?? null,
      hasNote: (noteDays.get(date)?.note ?? "") !== "",
      notePreview: (noteDays.get(date)?.note ?? "").slice(0, 200),
    })),
  });
});
