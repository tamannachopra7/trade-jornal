import { handler, ok } from "@/server/api";
import { getNotionSettings, setNotionSettings } from "@/server/settings";

export const GET = handler(async () => {
  const settings = await getNotionSettings();
  return ok({ 
    configured: Boolean(settings.secret && settings.databaseId),
    databaseId: settings.databaseId 
  });
});

export const POST = handler(async (request: Request) => {
  const body = await request.json();
  await setNotionSettings(body.secret || null, body.databaseId || null);
  return ok({ success: true });
});
