import { bad, handler, ok } from "@/server/api";
import { newId, nowIso } from "@/server/ids";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async () => {
  const { databases } = createAdminClient();
  const playbooksRes = await databases.listDocuments(DATABASE_ID, 'playbooks', [Query.limit(5000), Query.orderAsc('createdAt')]);
  const rows = playbooksRes.documents;
  
  const tradesRes = await databases.listDocuments(DATABASE_ID, 'trades', [Query.limit(5000), Query.select(['playbookId'])]);
  const counts = new Map<string, number>();
  for (const trade of tradesRes.documents) {
    if (trade.playbookId) counts.set(trade.playbookId, (counts.get(trade.playbookId) ?? 0) + 1);
  }
  return ok({
    playbooks: rows.map((row) => ({
      id: row.$id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      rules: JSON.parse(row.rulesJson) as string[],
      tradeCount: counts.get(row.$id) ?? 0,
    })),
  });
});

export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as { name?: string; description?: string; rules?: string[] };
  if (!body.name) return bad("name is required");
  const id = newId();
  const { databases } = createAdminClient();
  await databases.createDocument(DATABASE_ID, 'playbooks', id, {
    name: body.name,
    description: body.description ?? "",
    rulesJson: JSON.stringify(body.rules ?? []),
    createdAt: nowIso(),
  });
  return ok({ id });
});
