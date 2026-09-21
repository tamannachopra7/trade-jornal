import { readFilters } from "@luxalgo/journal-core";
import { queryTrades } from "@/server/trades-query";
import {
  getJournalDefaults,
  getMultipliers,
  getTimeZone,
  getImportTimeZone,
} from "@/server/settings";
import { handler, ok } from "@/server/api";
import { attachmentExportRecord, EXPORT_ATTACHMENTS_NOTE } from "@/lib/export-format";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

export const GET = handler(async (request: Request) => {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";

  if (format === "csv") {
    const header =
      "key,account_id,symbol,direction,status,opened_at,closed_at,quantity,avg_entry,avg_exit,gross_pnl,fees,net_pnl,tags,notes";
    const escape = (value: unknown): string => {
      const text = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const { rows } = await queryTrades(readFilters(url.searchParams));
    const lines = rows.map((row) =>
      [
        row.key,
        row.accountId,
        row.symbol,
        row.direction,
        row.status,
        row.openedAt,
        row.closedAt ?? "",
        row.quantity,
        row.avgEntry,
        row.avgExit ?? "",
        row.grossPnl,
        row.fees,
        row.netPnl,
        row.tagsJson ?? "[]",
        row.notes ?? "",
      ]
        .map(escape)
        .join(","),
    );
    return new Response([header, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="trades.csv"',
      },
    });
  }

  const { databases } = createAdminClient();
  
  const fetchAll = async (collectionId: string) => {
    try {
      const res = await databases.listDocuments(DATABASE_ID, collectionId, [Query.limit(5000)]);
      return res.documents.map(d => {
        const { $id, $createdAt, $updatedAt, $permissions, $databaseId, $collectionId, ...rest } = d;
        return { id: $id, createdAt: $createdAt, updatedAt: $updatedAt, ...rest };
      });
    } catch {
      return [];
    }
  };

  const accounts = await fetchAll('accounts');
  const executions = await fetchAll('executions');
  const trades = await fetchAll('trades');
  const journalDays = await fetchAll('journalDays');
  const notes = await fetchAll('notes');
  const folders = await fetchAll('folders');
  const playbooks = await fetchAll('playbooks');
  const noteTemplates = await fetchAll('noteTemplates');
  const tradeRuleChecks = await fetchAll('tradeRuleChecks');
  const progressRules = await fetchAll('progressRules');
  const progressChecks = await fetchAll('progressChecks');
  const missedTrades = await fetchAll('missedTrades');
  const propAccounts = await fetchAll('propAccounts');
  const propEntries = await fetchAll('propEntries');
  const propReceipts = await fetchAll('propReceipts');
  const propAudit = await fetchAll('propAudit');
  const attachments = await fetchAll('attachments');

  return ok({
    exportedAt: new Date().toISOString(),
    note: EXPORT_ATTACHMENTS_NOTE,
    accounts: accounts.map(({ credentialsEnc: _omitted, ...safe }: any) => safe),
    executions,
    trades,
    journalDays,
    notes,
    folders,
    playbooks,
    noteTemplates,
    tradeRuleChecks,
    progressRules,
    progressChecks,
    missedTrades,
    propAccounts,
    propEntries,
    propReceipts,
    propAudit,
    journalDefaults: await getJournalDefaults(),
    settings: {
      timeZone: await getTimeZone(),
      importTimeZone: await getImportTimeZone(),
      multipliers: await getMultipliers(),
    },
    attachments: attachments.map((a: any) => attachmentExportRecord(a)),
  });
});
