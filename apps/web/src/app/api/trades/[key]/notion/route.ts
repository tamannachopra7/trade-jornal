import { bad, handler, ok } from "@/server/api";
import { getTradeByKey, rowToTrade } from "@/server/trades-query";
import { syncTradeToNotion } from "@/server/integrations/notion";
import { getMultipliers, getJournalDefaults } from "@/server/settings";

type Params = { params: Promise<{ key: string }> };

export const POST = handler(async (request: Request, { params }: Params) => {
  const { key } = await params;
  const row = await getTradeByKey(key);
  if (!row) return bad("Trade not found", 404);

  const multipliers = await getMultipliers();
  const defaults = await getJournalDefaults();
  const trade = rowToTrade(row, { multipliers, defaults });

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
