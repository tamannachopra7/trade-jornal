import { bad, handler, ok } from "@/server/api";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

type Params = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  let existing;
  try {
    existing = await databases.getDocument(DATABASE_ID, 'playbooks', id);
  } catch {
    return bad("Playbook not found", 404);
  }
  const body = (await request.json()) as { name?: string; description?: string; rules?: string[] };
  await databases.updateDocument(DATABASE_ID, 'playbooks', id, {
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    rulesJson: body.rules ? JSON.stringify(body.rules) : existing.rulesJson,
  });
  return ok({ updated: true });
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  const trades = await databases.listDocuments(DATABASE_ID, 'trades', [Query.equal('playbookId', id), Query.limit(5000)]);
  for (const t of trades.documents) {
    await databases.updateDocument(DATABASE_ID, 'trades', t.$id, { playbookId: null });
  }
  try { await databases.deleteDocument(DATABASE_ID, 'playbooks', id); } catch {}
  return ok({ deleted: true });
});
