"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { postJson } from "@/lib/use-api";
import { CheckCircle2, RefreshCw } from "lucide-react";

export function SyncNotion({ tradeKey }: { tradeKey: string }) {
  const [syncing, setSyncing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await postJson(`/api/trades/${encodeURIComponent(tradeKey)}/notion`, {});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {success ? "Synced!" : "Sync to Notion"}
        </Button>
        {success && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
