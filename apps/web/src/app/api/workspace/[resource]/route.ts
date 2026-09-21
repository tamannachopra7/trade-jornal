import { dayKeyOf } from "@luxalgo/journal-core";
import { handler, ok, bad, requireValue } from "@/server/api";
import { newId, nowIso } from "@/server/ids";
import { getJournalDefaults, getTimeZone, setSetting } from "@/server/settings";
import { scheduledRules } from "@/lib/progress";
import { parseJournalDefaults } from "@/lib/journal-defaults";
import { createAdminClient } from "@/lib/appwrite";
import { Query } from "node-appwrite";

const DATABASE_ID = 'trade_journal';

type Context = { params: Promise<{ resource: string }> };

const today = async () => dayKeyOf(nowIso(), await getTimeZone());

const rules = async () => {
  const { databases } = createAdminClient();
  try {
    const res = await databases.listDocuments(DATABASE_ID, 'progressRules', [
      Query.orderAsc('createdAt'),
      Query.limit(5000)
    ]);
    return res.documents.map(r => ({
      ...r,
      id: r.$id,
      weekdays: JSON.parse(r.weekdaysJson) as number[]
    }));
  } catch {
    return [];
  }
};

const validDate = (s: unknown): s is string =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
const text = (s: unknown, max = 100000): s is string => typeof s === "string" && s.length <= max;
const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

export const GET = handler(async (_request: Request, { params }: Context) => {
  const { resource } = await params;
  const { databases } = createAdminClient();
  
  if (resource === "templates") {
    let templates: any[] = [];
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'noteTemplates', [Query.limit(5000)]);
      templates = res.documents.map(d => ({ ...d, id: d.$id }));
    } catch {}
    return ok({ templates });
  }
  
  if (resource === "progress") {
    let checks: any[] = [];
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'progressChecks', [Query.limit(5000)]);
      checks = res.documents.map(d => ({ ...d, id: d.$id }));
    } catch {}
    return ok({ rules: await rules(), checks, today: await today() });
  }
  
  if (resource === "missed") {
    let trades: any[] = [];
    try {
      const res = await databases.listDocuments(DATABASE_ID, 'missedTrades', [
        Query.orderDesc('observedAt'),
        Query.limit(5000)
      ]);
      trades = res.documents.map(d => ({ ...d, id: d.$id }));
    } catch {}
    return ok({ trades });
  }
  
  if (resource === "defaults") return ok(await getJournalDefaults());
  return bad("Unknown resource", 404);
});

export const POST = handler(async (request: Request, { params }: Context) => {
  const { resource } = await params;
  const b = await request.json();
  const { databases } = createAdminClient();
  
  if (resource === "templates") {
    requireValue(
      text(b.name, 100) && b.name.trim() && text(b.content),
      "A template needs a name and content (up to 100,000 characters).",
    );
    const id = newId();
    await databases.createDocument(DATABASE_ID, 'noteTemplates', id, {
      name: b.name.trim(),
      content: b.content
    });
    return ok({ id });
  }
  
  if (resource === "progress") {
    if (b.ruleId) {
      const td = await today();
      requireValue(
        validDate(b.date) && b.date <= td && typeof b.done === "boolean",
        "Choose a valid date up to today.",
      );
      const r = await rules();
      requireValue(
        scheduledRules(r as any, b.date).some((r: any) => r.id === b.ruleId),
        "This routine is not scheduled on that date.",
      );
      const id = `${b.ruleId}_${b.date.replace(/-/g, '')}`; // Appwrite IDs cannot have colons
      
      try {
        await databases.updateDocument(DATABASE_ID, 'progressChecks', id, { done: b.done });
      } catch (err: any) {
        if (err.code === 404) {
          await databases.createDocument(DATABASE_ID, 'progressChecks', id, {
            ruleId: b.ruleId,
            date: b.date,
            done: b.done
          });
        }
      }
      return ok({ saved: true });
    }
    
    requireValue(
      text(b.title, 200) &&
        b.title.trim() &&
        ["Before trading", "During trading", "After trading"].includes(b.stage),
      "Enter a routine title and stage.",
    );
    requireValue(
      Array.isArray(b.weekdays) &&
        b.weekdays.length > 0 &&
        b.weekdays.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 6),
      "Select at least one weekday.",
    );
    const id = newId();
    await databases.createDocument(DATABASE_ID, 'progressRules', id, {
      title: b.title.trim(),
      stage: b.stage,
      weekdaysJson: JSON.stringify([...new Set(b.weekdays)]),
      createdAt: await today(),
    });
    return ok({ id });
  }
  
  if (resource === "missed") {
    requireValue(
      text(b.symbol, 80) && b.symbol.trim() && ["long", "short"].includes(b.direction),
      "Enter a symbol and direction.",
    );
    requireValue(
      text(b.observedAt, 40) && !isNaN(Date.parse(b.observedAt)),
      "Enter a valid observation time.",
    );
    requireValue(text(b.notes ?? ""), "Notes are too long.");
    for (const key of ["entry", "stop", "target"])
      requireValue(b[key] == null || finite(b[key]), `Invalid ${key} price.`);
      
    if (b.playbookId) {
      try {
        await databases.getDocument(DATABASE_ID, 'playbooks', b.playbookId);
      } catch {
        requireValue(false, "Strategy not found.");
      }
    }
    
    const values = {
      symbol: b.symbol.trim().toUpperCase(),
      direction: b.direction,
      observedAt: new Date(b.observedAt).toISOString(),
      playbookId: b.playbookId || null,
      entry: b.entry ?? null,
      stop: b.stop ?? null,
      target: b.target ?? null,
      notes: b.notes ?? "",
    };
    
    if (b.id) {
      try {
        await databases.getDocument(DATABASE_ID, 'missedTrades', b.id);
        await databases.updateDocument(DATABASE_ID, 'missedTrades', b.id, values);
        return ok({ id: b.id });
      } catch {
        requireValue(false, "Missed trade not found.");
      }
    }
    const id = newId();
    await databases.createDocument(DATABASE_ID, 'missedTrades', id, { ...values, createdAt: nowIso() });
    return ok({ id });
  }
  
  if (resource === "defaults") {
    let knownIds = new Set();
    try {
      const accs = await databases.listDocuments(DATABASE_ID, 'accounts', [Query.limit(5000)]);
      knownIds = new Set(accs.documents.map(a => a.$id));
    } catch {}
    
    const parsed = parseJournalDefaults(b, (id) => knownIds.has(id));
    if (parsed.error !== undefined) return bad(parsed.error);
    await setSetting("journalDefaults", JSON.stringify(parsed.defaults));
    return ok({ saved: true });
  }
  return bad("Unknown resource", 404);
});

export const DELETE = handler(async (request: Request, { params }: Context) => {
  const { resource } = await params;
  const b = await request.json();
  requireValue(text(b.id, 200), "Invalid id.");
  const { databases } = createAdminClient();
  
  if (resource === "templates") {
    await databases.deleteDocument(DATABASE_ID, 'noteTemplates', b.id);
  } else if (resource === "progress") {
    await databases.updateDocument(DATABASE_ID, 'progressRules', b.id, { archivedAt: await today() });
  } else if (resource === "missed") {
    await databases.updateDocument(DATABASE_ID, 'missedTrades', b.id, { archivedAt: b.restore ? null : nowIso() });
  } else {
    return bad("Unknown resource", 404);
  }
  return ok({ saved: true });
});
