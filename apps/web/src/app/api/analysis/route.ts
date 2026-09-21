import {
  analyzeGroups,
  DIMENSIONS,
  readFilters,
  summarizeGroup,
  type Dimension,
} from "@luxalgo/journal-core";
import { handler, ok } from "@/server/api";
import { queryTrades } from "@/server/trades-query";
import { getTimeZone } from "@/server/settings";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const primary = params.get("primary") as Dimension,
    secondary = params.get("secondary") as Dimension;
  const { trades } = await queryTrades(readFilters(params));
  const tz = await getTimeZone();
  
  const { databases } = createAdminClient();
  const accountsResponse = await databases.listDocuments(DATABASE_ID, 'accounts');
  const accountRows = accountsResponse.documents;
  
  const accountCurrencies = new Map(accountRows.map((a) => [a.$id, a.currency]));
  const currencies = [...new Set(trades.map((t) => accountCurrencies.get(t.accountId) ?? "USD"))];
  
  let playbooks: { id: string; name: string }[] = [];
  try {
    const pResponse = await databases.listDocuments(DATABASE_ID, 'playbooks');
    playbooks = pResponse.documents.map(doc => ({ id: doc.$id, name: doc.name }));
  } catch {
    // collection might not exist yet
  }
  
  return ok({
    summary: summarizeGroup(trades),
    groups: analyzeGroups(
      trades,
      Object.hasOwn(DIMENSIONS, primary) ? primary : "symbol",
      Object.hasOwn(DIMENSIONS, secondary) ? secondary : undefined,
      tz,
    ),
    playbooks,
    currencies,
    timeZone: tz,
    accounts: accountRows.map((a) => ({ id: a.$id, name: a.name })),
  });
});
