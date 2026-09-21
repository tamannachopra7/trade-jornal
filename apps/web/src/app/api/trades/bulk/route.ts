import { bad, handler, ok } from "@/server/api";
import { deleteExecutionsForTrades } from "@/server/executions";
import { nowIso } from "@/server/ids";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

interface BulkBody {
  keys: string[];
  action: "review" | "unreview" | "tag" | "untag" | "playbook" | "delete";
  tag?: string;
  playbookId?: string | null;
}

export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as BulkBody;
  if (!Array.isArray(body.keys) || body.keys.length === 0) return bad("keys are required");
  const { databases } = createAdminClient();
  
  // Appwrite doesn't have an "IN" operator that scales indefinitely, chunk queries if necessary.
  // Actually Query.equal('key', [...]) might work if length < 100
  let rows: any[] = [];
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'trades', [Query.contains('$id', body.keys), Query.limit(5000)]);
    rows = res.documents.filter(d => body.keys.includes(d.$id));
  } catch {
    return bad("Error fetching trades");
  }

  switch (body.action) {
    case "review":
    case "unreview":
      for (const key of body.keys) {
        await databases.updateDocument(DATABASE_ID, 'trades', key, { reviewedAt: body.action === "review" ? nowIso() : null });
      }
      return ok({ updated: rows.length });
    case "tag":
    case "untag": {
      if (!body.tag) return bad("tag is required");
      for (const row of rows) {
        const tags = new Set<string>(row.tagsJson ? (JSON.parse(row.tagsJson) as string[]) : []);
        if (body.action === "tag") tags.add(body.tag);
        else tags.delete(body.tag);
        await databases.updateDocument(DATABASE_ID, 'trades', row.$id, { tagsJson: JSON.stringify([...tags]) });
      }
      return ok({ updated: rows.length });
    }
    case "playbook":
      for (const key of body.keys) {
        await databases.updateDocument(DATABASE_ID, 'trades', key, { playbookId: body.playbookId ?? null });
      }
      return ok({ updated: rows.length });
    case "delete": {
      const byAccount = new Map<string, string[]>();
      for (const row of rows) {
        const ids = JSON.parse(row.executionIdsJson) as string[];
        byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), ...ids]);
      }
      for (const [accountId, executionIds] of byAccount) {
        await deleteExecutionsForTrades(accountId, executionIds);
      }
      return ok({ deleted: rows.length });
    }
    default:
      return bad("Unknown action");
  }
});
