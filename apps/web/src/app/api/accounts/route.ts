import { bad, handler, ok } from "@/server/api";
import { encryptJson } from "@/server/crypto";
import { newId, nowIso } from "@/server/ids";
import { syncAccount } from "@/server/sync";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';
const COLLECTION_ID = 'accounts';

export const GET = handler(async (request: Request) => {
  const { databases } = createAdminClient();
  const summary = new URL(request.url).searchParams.get("summary") === "1";
  
  const response = await databases.listDocuments(
    DATABASE_ID,
    COLLECTION_ID,
    [Query.orderAsc("createdAt")]
  );
  
  if (summary) {
    return ok({
      accounts: response.documents.map(doc => ({
        id: doc.$id,
        name: doc.name,
        broker: doc.broker,
        archivedAt: doc.archivedAt,
      }))
    });
  }

  return ok({
    accounts: response.documents.map(doc => {
      const { credentialsEnc, $id, ...safe } = doc;
      return {
        ...safe,
        id: $id,
        connected: credentialsEnc !== null && credentialsEnc !== undefined && credentialsEnc !== "",
        snapshot: doc.snapshotJson ? JSON.parse(doc.snapshotJson) : null,
      };
    })
  });
});

interface CreateBody {
  name?: string;
  kind?: "sync" | "import" | "manual";
  broker?: string;
  currency?: string;
  initialBalance?: number;
  profitCalcMethod?: "fifo" | "lifo" | "wavg";
  credentials?: Record<string, string>;
  autoSync?: boolean;
}

export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as CreateBody;
  if (!body.name || !body.kind) return bad("name and kind are required");
  if (body.kind === "sync" && (!body.broker || !body.credentials)) {
    return bad("sync accounts need a broker and credentials");
  }

  const { databases } = createAdminClient();
  const id = newId();

  const data: any = {
    name: body.name,
    broker: body.broker ?? "",
    kind: body.kind,
    currency: body.currency ?? "USD",
    initialBalance: body.initialBalance ?? 0,
    profitCalcMethod: body.profitCalcMethod ?? "fifo",
    autoSync: body.autoSync ?? body.kind === "sync",
    createdAt: nowIso(),
  };

  if (body.kind === "sync") {
    data.credentialsEnc = encryptJson(body.credentials);
  }

  try {
    await databases.createDocument(DATABASE_ID, COLLECTION_ID, id, data);
  } catch (err: any) {
    return bad("Failed to create account: " + err.message);
  }

  let sync = null;
  if (body.kind === "sync") {
    try {
      // NOTE: syncAccount will also need to be rewritten to use Appwrite!
      sync = await syncAccount(id);
    } catch (error) {
      // Bad credentials shouldn't strand a half-created account.
      await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, id);
      return bad(error instanceof Error ? error.message : "Broker connection failed", 502);
    }
  }
  return ok({ id, sync });
});
