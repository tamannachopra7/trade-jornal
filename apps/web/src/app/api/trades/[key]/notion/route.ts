import { bad, handler, notFound, ok } from "@/server/api";
import { getTrade } from "@/server/trades-query";
import { syncTradeToNotion } from "@/server/integrations/notion";

export const POST = handler(async (request: Request, context: { params: { key: string } }) => {
  const { key } = await context.params;
  const trade = await getTrade(key);
  if (!trade) return notFound();

  // Determine base URL for deep linking
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  try {
    await syncTradeToNotion(trade, baseUrl);
    return ok({ success: true });
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Failed to sync to Notion");
  }
});
