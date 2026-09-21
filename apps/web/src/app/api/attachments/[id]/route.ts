import { handler, ok, bad } from "@/server/api";
import { createAdminClient } from "@/lib/appwrite";

const DATABASE_ID = 'trade_journal';

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  let a;
  try {
    a = await databases.getDocument(DATABASE_ID, 'attachments', id);
  } catch {
    return bad("Attachment not found", 404);
  }
  
  let buffer: Uint8Array;
  if (typeof a.data === 'string') {
    // If base64 encoded
    buffer = Buffer.from(a.data, 'base64');
  } else {
    // Assuming it's already a buffer or array
    buffer = new Uint8Array(a.data);
  }

  return new Response(buffer as any, {
    headers: {
      "Content-Type": a.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${a.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = handler(async (_request: Request, { params }: Context) => {
  const { id } = await params;
  const { databases } = createAdminClient();
  try {
    await databases.deleteDocument(DATABASE_ID, 'attachments', id);
  } catch {}
  return ok({ deleted: true });
});
