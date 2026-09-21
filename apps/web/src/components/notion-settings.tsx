"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { postJson, useApi } from "@/lib/use-api";
import { CheckCircle2, Lock } from "lucide-react";

interface NotionSettingsPayload {
  configured: boolean;
  databaseId: string | null;
}

export function NotionSettings() {
  const { data, refresh } = useApi<NotionSettingsPayload>("/api/settings/notion");
  const [secret, setSecret] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setDatabaseId(data.databaseId || "");
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await postJson("/api/settings/notion", { secret, databaseId });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setSecret(""); // Don't keep the secret in the state to avoid accidental modification
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save Notion settings");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError("");
    try {
      await postJson("/api/settings/notion", { secret: null, databaseId: null });
      setDatabaseId("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear Notion settings");
    } finally {
      setSaving(false);
    }
  };

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Notion Integration</CardTitle>
          {data.configured && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              Connected
            </div>
          )}
        </div>
        <CardDescription>
          Sync your trades to a Notion database for custom dashboards and note-taking.
          Follow the <a href="https://developers.notion.com/docs/create-a-notion-integration" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Notion guide</a> to create an Internal Integration. Don't forget to share your database with the integration!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="notion-secret">Internal Integration Secret</Label>
          <div className="relative">
            <Input
              id="notion-secret"
              type="password"
              placeholder={data.configured ? "••••••••••••••••••••••••" : "secret_..."}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-[0.8rem] text-muted-foreground">
            {data.configured && !secret ? "Leave blank to keep existing secret." : "Found in your Notion Integration settings."}
          </p>
        </div>
        
        <div className="space-y-1">
          <Label htmlFor="notion-database">Database ID</Label>
          <Input
            id="notion-database"
            placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p"
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
          />
          <p className="text-[0.8rem] text-muted-foreground">
            The 32-character ID in your Notion database URL.
          </p>
        </div>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={saving || (!data.configured && (!secret || !databaseId))}>
            {saved ? "Saved ✓" : data.configured ? "Update Connection" : "Connect Notion"}
          </Button>
          {data.configured && (
            <Button variant="outline" onClick={clear} disabled={saving}>
              Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
