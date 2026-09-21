import { analyzeAdherence, readFilters } from "@luxalgo/journal-core";
import { queryTrades } from "@/server/trades-query";
import { handler, ok } from "@/server/api";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const { trades } = await queryTrades(readFilters(new URL(request.url).searchParams));
  const { databases } = createAdminClient();
  
  const checksRes = await databases.listDocuments(DATABASE_ID, 'tradeRuleChecks', [Query.limit(5000)]);
  const checks = checksRes.documents as any[];
  
  const playbooksRes = await databases.listDocuments(DATABASE_ID, 'playbooks', [Query.limit(5000)]);
  const books = playbooksRes.documents.map((book) => ({
    id: book.$id,
    rules: JSON.parse(book.rulesJson) as string[],
  }));
  
  const accountsRes = await databases.listDocuments(DATABASE_ID, 'accounts', [Query.limit(5000)]);
  const currencies = new Map(accountsRes.documents.map((a) => [a.$id, a.currency]));
  
  return ok({
    books: analyzeAdherence(trades, books, checks).map(({ accountIds, ...book }) => ({
      ...book,
      currencies: [...new Set(accountIds.map((id) => currencies.get(id) ?? "USD"))],
    })),
  });
});
