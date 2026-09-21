import { Client } from "@notionhq/client";
import { getNotionSettings } from "@/server/settings";
import type { Trade } from "@luxalgo/journal-core";

export async function syncTradeToNotion(trade: Trade, baseUrl?: string) {
  const { secret, databaseId } = await getNotionSettings();
  if (!secret || !databaseId) return;

  const notion = new Client({ auth: secret });

  try {
    // First, check if the trade already exists in Notion
    const existing = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Trade ID",
        rich_text: {
          equals: trade.key,
        },
      },
    });

    const properties: Record<string, any> = {
      // Assuming the title property is named "Symbol" or "Name" - we'll just use the default title property behavior
      "Symbol": {
        title: [
          {
            text: {
              content: trade.symbol,
            },
          },
        ],
      },
      "Trade ID": {
        rich_text: [
          {
            text: {
              content: trade.key,
            },
          },
        ],
      },
      "Direction": {
        select: {
          name: trade.direction,
        },
      },
      "Status": {
        select: {
          name: trade.status,
        },
      },
      "Net PnL": {
        number: trade.netPnl,
      },
      "Date": {
        date: {
          start: trade.openedAt.substring(0, 10), // YYYY-MM-DD
        },
      },
    };

    if (baseUrl) {
      properties["Link"] = {
        url: `${baseUrl}/trades/${trade.key}`,
      };
    }

    if (existing.results.length > 0) {
      // Update existing
      await notion.pages.update({
        page_id: existing.results[0].id,
        properties,
      });
    } else {
      // Create new
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties,
      });
    }
  } catch (error) {
    console.error("Failed to sync trade to Notion:", error);
    // We don't throw here to avoid failing the main app flow
  }
}
