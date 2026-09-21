import { handler, ok, requireValue } from "@/server/api";
import { newId, nowIso } from "@/server/ids";
import { attachmentMime, MAX_ATTACHMENT_SIZE } from "@/lib/attachment-validation";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

async function owner(type: string, id: string) {
  const { databases } = createAdminClient();
  const exists = async (coll: string, docId: string) => {
    try {
      await databases.getDocument(DATABASE_ID, coll, docId);
      return true;
    } catch {
      return false;
    }
  };
  
  if (type === "prop-account") return await exists('propAccounts', id);
  if (type === "prop-entry") return await exists('propEntries', id);
  if (type === "trade") return await exists('trades', id);
  if (type === "note") return await exists('notes', id);
  if (type === "missed") return await exists('missedTrades', id);
  
  return (
    type === "day" &&
    /^\d{4}-\d{2}-\d{2}$/.test(id) &&
    !isNaN(Date.parse(id)) &&
    new Date(id).toISOString().slice(0, 10) === id
  );
}

export const GET = handler(async (request: Request) => {
  const p = new URL(request.url).searchParams;
  const type = p.get("type") ?? "",
    id = p.get("id") ?? "";
  requireValue(await owner(type, id), "Attachment owner not found.");
  
  const { databases } = createAdminClient();
  const res = await databases.listDocuments(DATABASE_ID, 'attachments', [
    Query.equal('ownerType', type),
    Query.equal('ownerId', id),
    Query.limit(5000)
  ]);
  
  return ok({
    attachments: res.documents.map(d => ({
      id: d.$id,
      name: d.name,
      mime: d.mime,
      size: d.size,
    }))
  });
});

export const POST = handler(async (request: Request) => {
  requireValue(
    Number(request.headers.get("content-length") ?? 0) <= MAX_ATTACHMENT_SIZE + 10000,
    "Files must be 8 MB or smaller.",
  );
  const form = await request.formData();
  const type = String(form.get("type") ?? ""),
    ownerId = String(form.get("id") ?? ""),
    file = form.get("file");
  requireValue(await owner(type, ownerId), "Attachment owner not found.");
  requireValue(
    file instanceof File && file.size > 0 && file.size <= MAX_ATTACHMENT_SIZE,
    "Choose a file up to 8 MB.",
  );
  const bytes = Buffer.from(await file.arrayBuffer()),
    mime = attachmentMime(bytes);
  requireValue(mime, "Supported files: PNG, JPEG, WebP and PDF.");
  const id = newId();
  
  const { databases } = createAdminClient();
  await databases.createDocument(DATABASE_ID, 'attachments', id, {
    ownerType: type,
    ownerId,
    name: file.name.slice(0, 200),
    mime,
    size: bytes.length,
    data: bytes.toString('base64'),
    createdAt: nowIso(),
  });
  
  return ok({ id });
});
