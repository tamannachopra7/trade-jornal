import { bad, handler, ok } from "@/server/api";
import { rebuildAccount } from "@/server/rebuild";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

type Params = { params: Promise<{ id: string }> };

interface PatchBody {
  name?: string;
  broker?: string;
  currency?: string;
  initialBalance?: number;
  profitCalcMethod?: "fifo" | "lifo" | "wavg";
  autoSync?: boolean;
}

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  let account;
  try {
    account = await databases.getDocument(DATABASE_ID, 'accounts', id);
  } catch {
    return bad("Account not found", 404);
  }

  const body = (await request.json()) as PatchBody;
  const patch: any = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.broker !== undefined) patch.broker = body.broker;
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.initialBalance !== undefined) patch.initialBalance = body.initialBalance;
  if (body.autoSync !== undefined) patch.autoSync = body.autoSync;
  if (body.profitCalcMethod !== undefined) patch.profitCalcMethod = body.profitCalcMethod;

  if (Object.keys(patch).length > 0) {
    await databases.updateDocument(DATABASE_ID, 'accounts', id, patch);
  }
  // A new profit-calc method changes per-exit attribution — recompute.
  if (body.profitCalcMethod && body.profitCalcMethod !== account.profitCalcMethod) {
    await rebuildAccount(id);
  }
  return ok({ updated: true });
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  const getDocs = async (coll: string) => {
    try {
      const res = await databases.listDocuments(DATABASE_ID, coll, [Query.equal('accountId', id), Query.limit(5000)]);
      return res.documents;
    } catch {
      return [];
    }
  };
  const [t, e] = await Promise.all([getDocs('trades'), getDocs('executions')]);
  for (const doc of t) {
    try { await databases.deleteDocument(DATABASE_ID, 'trades', doc.$id); } catch {}
  }
  for (const doc of e) {
    try { await databases.deleteDocument(DATABASE_ID, 'executions', doc.$id); } catch {}
  }
  try { await databases.deleteDocument(DATABASE_ID, 'accounts', id); } catch {}
  return ok({ deleted: true });
});
