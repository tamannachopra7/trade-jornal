import { createHash } from "node:crypto";
import { parseCsv } from "@luxalgo/journal-importers";
import { mutateProp } from "./prop-firms";
import { requireValue, RequestError } from "./api";
import { newId, nowIso } from "./ids";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
class PreviewRollback extends Error {
  constructor(public result: ImportResult) {
    super("Preview");
  }
}
type ImportResult = { imported: number; skipped: number; sample: Record<string, string>[] };
/** Deliberately a generic settled-cash format; bank/firm CSVs need explicit mapping. */
export async function importPropCsv(content: string, preview: boolean): Promise<ImportResult> {
  requireValue(Buffer.byteLength(content) <= 2 * 1024 * 1024, "CSV must be 2 MB or smaller.");
  requireValue(
    (content.match(/"/g)?.length ?? 0) % 2 === 0,
    "CSV has an unterminated quoted field.",
  );
  const [header, ...rows] = parseCsv(content);
  const columns = [
    "id",
    "kind",
    "firm",
    "account_id",
    "currency",
    "date",
    "amount",
    "category",
    "expense_id",
    "reference",
    "notes",
  ];
  requireValue(
    header &&
      header.length === columns.length &&
      new Set(header).size === header.length &&
      columns.every((c) => header.includes(c)),
    "Use the generic prop cash CSV header template.",
  );
  requireValue(rows.length > 0 && rows.length <= 1000, "Import 1–1,000 rows at a time.");
  const records = rows.map((row, i) => {
    requireValue(
      row.length === header.length,
      `Row ${i + 2}: column count differs from the header.`,
    );
    return Object.fromEntries(columns.map((c) => [c, row[header.indexOf(c)]!.trim()]));
  });
  const seen = new Set<string>();
  for (const row of records) {
    requireValue(
      /^[a-zA-Z0-9_-]{1,100}$/.test(row.id!) && !seen.has(row.id!),
      "Each CSV row needs a unique stable ID.",
    );
    seen.add(row.id!);
  }
  
  const { databases } = createAdminClient();
  let imported = 0,
    skipped = 0;
    
  try {
    for (const [index, row] of records.entries()) {
      try {
        requireValue(
          ["expense", "refund", "payout"].includes(row.kind!),
          "Kind must be expense, refund or payout (actual cash received).",
        );
        const id = `csv-${hash(row.id!)}`.substring(0, 36);
        const fingerprint = `CSV import ${hash(JSON.stringify(row))}`;
        
        let old;
        try {
          old = await databases.getDocument(DATABASE_ID, 'propEntries', id);
        } catch {}
        
        if (old) {
          const auditRes = await databases.listDocuments(DATABASE_ID, 'propAudit', [
            Query.equal('entityId', id),
            Query.equal('reason', fingerprint),
            Query.limit(1)
          ]);
          requireValue(
            auditRes.documents.length > 0,
            "This CSV ID was already imported with different data. Edit the existing record or use a new ID for a separate transaction.",
          );
          skipped++;
          continue;
        }
        
        let parentId = null;
        if (row.expense_id) {
          let p;
          try {
            p = await databases.getDocument(DATABASE_ID, 'propEntries', row.expense_id);
          } catch {}
          parentId = p ? row.expense_id : `csv-${hash(row.expense_id)}`.substring(0, 36);
        }

        const command = {
          action: "entry.save" as const,
          id,
          revision: 0,
          kind: row.kind as "expense" | "refund" | "payout",
          accountId: row.account_id,
          firm: row.firm,
          currency: row.currency,
          occurredOn: row.date,
          amount: row.amount,
          category: row.category,
          parentId,
          reference: row.reference,
          notes: row.notes,
          splitPercent: "100",
          fee: "0",
          status: "requested" as const,
        };
        await mutateProp(command);
        if (row.kind === "payout") {
          await mutateProp({
            action: "receipt.add",
            id: `${id}-cash`,
            payoutId: id,
            revision: 1,
            kind: "receipt",
            amount: row.amount,
            occurredOn: row.date,
            reference: row.reference,
            notes: row.notes,
          });
          await mutateProp({
            ...command,
            revision: 2,
            status: "completed",
            reason: "Imported settled payout",
          });
        }
        await databases.createDocument(DATABASE_ID, 'propAudit', newId(), {
          entityType: "entry",
          entityId: id,
          beforeJson: null,
          afterJson: JSON.stringify(row),
          reason: fingerprint,
          createdAt: nowIso(),
        });
        imported++;
      } catch (error) {
        throw new RequestError(`Row ${index + 2}: ${(error as Error).message}`);
      }
    }
    const result = { imported, skipped, sample: records.slice(0, 5) };
    if (preview) throw new PreviewRollback(result);
    return result;
  } catch (error) {
    if (error instanceof PreviewRollback) return error.result;
    throw error;
  }
}
