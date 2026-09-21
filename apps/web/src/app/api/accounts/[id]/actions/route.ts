import { bad, handler, ok } from "@/server/api";
import { nowIso } from "@/server/ids";
import { rebuildAccount } from "@/server/rebuild";
import { syncAccount } from "@/server/sync";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

type Params = { params: Promise<{ id: string }> };

interface ActionBody {
  action: "archive" | "unarchive" | "clear" | "sync" | "transfer";
  /** For "transfer": destination account id. */
  toAccountId?: string;
}

export const POST = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const { databases } = createAdminClient();

  let account;
  try {
    account = await databases.getDocument(DATABASE_ID, 'accounts', id);
  } catch {
    return bad("Account not found", 404);
  }
  const body = (await request.json()) as ActionBody;

  switch (body.action) {
    case "archive":
      await databases.updateDocument(DATABASE_ID, 'accounts', id, { archivedAt: nowIso() });
      return ok({ archived: true });
    case "unarchive":
      await databases.updateDocument(DATABASE_ID, 'accounts', id, { archivedAt: null });
      return ok({ archived: false });
    case "clear": {
      const getDocs = async (coll: string) => {
        const res = await databases.listDocuments(DATABASE_ID, coll, [Query.equal('accountId', id), Query.limit(5000)]);
        return res.documents;
      };
      const [t, e] = await Promise.all([getDocs('trades'), getDocs('executions')]);
      for (const doc of t) await databases.deleteDocument(DATABASE_ID, 'trades', doc.$id);
      for (const doc of e) await databases.deleteDocument(DATABASE_ID, 'executions', doc.$id);
      return ok({ cleared: true });
    }
    case "sync":
      return ok({ sync: await syncAccount(id) });
    case "transfer": {
      if (!body.toAccountId) return bad("toAccountId is required");
      const destinationId = body.toAccountId;
      let destination;
      try {
        destination = await databases.getDocument(DATABASE_ID, 'accounts', destinationId);
      } catch {
        return bad("Destination account not found", 404);
      }

      const tRes = await databases.listDocuments(DATABASE_ID, 'trades', [Query.equal('accountId', id), Query.limit(5000)]);
      const sourceTrades = tRes.documents;
      const eRes = await databases.listDocuments(DATABASE_ID, 'executions', [Query.equal('accountId', id), Query.limit(5000)]);
      const sourceExecutions = eRes.documents;
      
      for (const doc of sourceExecutions) {
        await databases.updateDocument(DATABASE_ID, 'executions', doc.$id, { accountId: destinationId });
      }
      for (const doc of sourceTrades) {
        await databases.deleteDocument(DATABASE_ID, 'trades', doc.$id);
      }
      
      await rebuildAccount(destinationId);

      for (const source of sourceTrades) {
        const hasAnnotations =
          source.notes ||
          source.tagsJson ||
          source.mistakesJson ||
          source.playbookId ||
          source.rating !== null ||
          source.stopLoss !== null ||
          source.profitTarget !== null ||
          source.reviewedAt;
        if (!hasAnnotations) continue;
        
        const newKey = destinationId + source.$id.slice(id.length);
        try {
          await databases.updateDocument(DATABASE_ID, 'trades', newKey, {
            notes: source.notes,
            tagsJson: source.tagsJson,
            mistakesJson: source.mistakesJson,
            playbookId: source.playbookId,
            rating: source.rating,
            stopLoss: source.stopLoss,
            profitTarget: source.profitTarget,
            reviewedAt: source.reviewedAt,
          });
        } catch (e) {
          // might not exist if it wasn't rebuilt
        }
      }
      return ok({ transferred: true });
    }
    default:
      return bad("Unknown action");
  }
});
