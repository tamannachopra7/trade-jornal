import { bad, handler, ok } from "@/server/api";
import { newId, nowIso } from "@/server/ids";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const folderId = url.searchParams.get("folder");
  const search = url.searchParams.get("q")?.toLowerCase();
  const tag = url.searchParams.get("tag");
  const sort = url.searchParams.get("sort") ?? "updated";
  
  const { databases } = createAdminClient();
  
  let queries = [Query.limit(5000)];
  if (folderId && folderId !== "all") {
    queries.push(Query.equal('folderId', folderId));
  }
  
  const notesRes = await databases.listDocuments(DATABASE_ID, 'notes', queries);
  let rows = notesRes.documents as any[];

  if (search) {
    rows = rows.filter(
      (row) =>
        row.title.toLowerCase().includes(search) || row.content.toLowerCase().includes(search),
    );
  }
  if (tag) {
    rows = rows.filter((row) => {
      try {
        return ((JSON.parse(row.tagsJson ?? "[]") as string[]) ?? []).includes(tag);
      } catch {
        return false;
      }
    });
  }
  rows.sort((a, b) =>
    sort === "created"
      ? b.createdAt.localeCompare(a.createdAt)
      : sort === "title"
        ? a.title.localeCompare(b.title)
        : b.updatedAt.localeCompare(a.updatedAt),
  );

  const folderRes = await databases.listDocuments(DATABASE_ID, 'folders', [Query.limit(5000), Query.orderAsc('createdAt')]);
  return ok({ notes: rows, folders: folderRes.documents });
});

interface CreateNoteBody {
  folderId?: string;
  title?: string;
  content?: string;
  tags?: string[];
  tradeKey?: string;
  dayDate?: string;
}

export const POST = handler(async (request: Request) => {
  const body = (await request.json()) as CreateNoteBody;
  const id = newId();
  const now = nowIso();
  const { databases } = createAdminClient();
  
  await databases.createDocument(DATABASE_ID, 'notes', id, {
    folderId: body.folderId ?? "my-notes",
    title: body.title ?? "",
    content: body.content ?? "",
    tagsJson: body.tags ? JSON.stringify(body.tags) : null,
    tradeKey: body.tradeKey ?? null,
    dayDate: body.dayDate ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return ok({ id });
});
