import { bad, handler, ok } from "@/server/api";
import { newId, nowIso } from "@/server/ids";
import { createAdminClient } from "@/lib/appwrite";

const DATABASE_ID = 'trade_journal';

export const POST = handler(async (request: Request) => {
  const body: unknown = await request.json();
  const name = body && typeof body === "object" && "name" in body ? body.name : null;
  if (typeof name !== "string" || !name.trim()) return bad("Enter a folder name.");
  if (name.trim().length > 100) return bad("Folder names must be 100 characters or fewer.");
  const id = newId();
  const { databases } = createAdminClient();
  await databases.createDocument(DATABASE_ID, 'folders', id, { name: name.trim(), kind: "user", createdAt: nowIso() });
  return ok({ id });
});
