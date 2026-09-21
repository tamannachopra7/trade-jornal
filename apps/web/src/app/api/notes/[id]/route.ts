import { bad, handler, ok } from "@/server/api";
import { nowIso } from "@/server/ids";
import { createAdminClient } from "@/lib/appwrite";

const DATABASE_ID = 'trade_journal';

type Params = { params: Promise<{ id: string }> };

interface PatchNoteBody {
  title?: string;
  content?: string;
  tags?: string[];
  folderId?: string;
}

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  let existing;
  try {
    existing = await databases.getDocument(DATABASE_ID, 'notes', id);
  } catch {
    return bad("Note not found", 404);
  }
  const body = (await request.json()) as PatchNoteBody;
  await databases.updateDocument(DATABASE_ID, 'notes', id, {
    title: body.title ?? existing.title,
    content: body.content ?? existing.content,
    tagsJson: body.tags ? JSON.stringify(body.tags) : existing.tagsJson,
    folderId: body.folderId ?? existing.folderId,
    updatedAt: nowIso(),
  });
  return ok({ updated: true });
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  try {
    await databases.deleteDocument(DATABASE_ID, 'notes', id);
  } catch {}
  return ok({ deleted: true });
});
