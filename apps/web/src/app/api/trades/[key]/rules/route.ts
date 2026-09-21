import { getTradeByKey } from "@/server/trades-query";
import { handler, ok, requireValue } from "@/server/api";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

type Context = { params: Promise<{ key: string }> };

async function source(key: string) {
  const trade = await getTradeByKey(key);
  requireValue(trade, "Trade not found.");
  const { databases } = createAdminClient();
  let book = null;
  if (trade.playbookId) {
    try {
      book = await databases.getDocument(DATABASE_ID, 'playbooks', trade.playbookId);
    } catch {}
  }
  return { book, rules: book ? [...new Set(JSON.parse(book.rulesJson) as string[])] : [] };
}

export const GET = handler(async (_request: Request, { params }: Context) => {
  const key = (await params).key;
  const { book, rules } = await source(key);
  const { databases } = createAdminClient();
  let checks: any[] = [];
  if (book) {
    const res = await databases.listDocuments(DATABASE_ID, 'tradeRuleChecks', [
      Query.equal('tradeKey', key),
      Query.equal('playbookId', book.$id),
      Query.limit(5000)
    ]);
    checks = res.documents;
  }
  
  return ok({
    name: book?.name ?? null,
    rules: rules.map((rule) => ({
      rule,
      followed: checks.find((c) => c.rule === rule)?.followed ?? null,
    })),
  });
});

export const POST = handler(async (request: Request, { params }: Context) => {
  const key = (await params).key,
    b = await request.json();
  const { book, rules } = await source(key);
  requireValue(
    book && rules.includes(b.rule) && (b.followed === null || typeof b.followed === "boolean"),
    "Choose an existing strategy rule.",
  );
  
  // Appwrite ID constraints: only a-zA-Z0-9 and period, hyphen, underscore
  // Hash the array instead of stringifying to avoid invalid characters like [ ] , "
  const crypto = require('crypto');
  const idStr = JSON.stringify([key, book.$id, b.rule]);
  const id = 'chk-' + crypto.createHash('sha256').update(idStr).digest('hex').substring(0, 30);
  
  const { databases } = createAdminClient();
  
  if (b.followed === null) {
    try { await databases.deleteDocument(DATABASE_ID, 'tradeRuleChecks', id); } catch {}
  } else {
    try {
      await databases.updateDocument(DATABASE_ID, 'tradeRuleChecks', id, { followed: b.followed });
    } catch {
      await databases.createDocument(DATABASE_ID, 'tradeRuleChecks', id, {
        tradeKey: key,
        playbookId: book.$id,
        rule: b.rule,
        followed: b.followed
      });
    }
  }
  return ok({ saved: true });
});
