"use client";

import { useState, useEffect, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Key01Icon,
  Copy01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Alert01Icon,
  Add01Icon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons";
import { api, type APIKeyItem, type CreateAPIKeyResponse } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<APIKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Key Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  // Reveal Newly Created Key Modal state
  const [revealedKey, setRevealedKey] = useState<CreateAPIKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.apiKeys.list();
      setKeys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    try {
      setCreating(true);
      const newKey = await api.apiKeys.create({
        name: keyName.trim(),
        scopes: ["stt", "tts", "translate", "agents"],
      });
      setCreateModalOpen(false);
      setKeyName("");
      setRevealedKey(newKey);
      fetchKeys();
      toast.success("API Key generated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setCreating(false);
    }
  };

  const handleCopyKey = async (rawKey: string) => {
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Failed to copy key to clipboard");
    }
  };

  const handleRevokeKey = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke "${name}"? Any applications using this key will immediately stop working.`)) {
      return;
    }

    try {
      setRevokingId(id);
      await api.apiKeys.revoke(id);
      toast.success("API key revoked");
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <HugeiconsIcon icon={Key01Icon} className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Developer API Keys</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Secret keys starting with <code className="text-primary font-mono text-[11px] bg-primary/5 px-1 py-0.5 rounded">sk-phos-</code> to authenticate Speech-to-Text, Text-to-Speech, and Agent APIs.
            </p>
          </div>
        </div>

        <Button
          onClick={() => setCreateModalOpen(true)}
          className="h-8 px-4 text-xs font-medium gap-1.5 shrink-0"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          Create New Key
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-destructive/5 border border-destructive/10 text-destructive text-sm">
          <HugeiconsIcon icon={Alert01Icon} className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Keys List */}
      <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Spinner className="size-4" />
            Loading API keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto size-12 rounded-full bg-primary/5 flex items-center justify-center text-primary mb-3">
              <HugeiconsIcon icon={ShieldKeyIcon} className="size-6" />
            </div>
            <h4 className="text-sm font-medium text-foreground">No API keys yet</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Create an API key to authenticate external applications and stream audio with the PhosAI APIs.
            </p>
            <Button
              onClick={() => setCreateModalOpen(true)}
              variant="outline"
              className="h-8 px-4 text-xs font-medium gap-1.5 mt-4"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
              Create your first API key
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {keys.map((k) => (
              <div
                key={k.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-foreground/[0.015] transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{k.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono py-0 h-4 bg-primary/5 text-primary border-primary/20">
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
                      {k.masked_key}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyKey(k.masked_key)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      title="Copy masked key"
                    >
                      <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
                    <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>
                      Last used: {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeKey(k.id, k.name)}
                    disabled={revokingId === k.id}
                    className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  >
                    {revokingId === k.id ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                    )}
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal 1: Create Key Dialog */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateKey}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">Generate new API key</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Give your API key a recognizable name to track where it is being used.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Key Name</label>
                <Input
                  placeholder="e.g. Production Speech Engine, Mobile STT"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  autoFocus
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Scopes granted:</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {["stt (Speech-to-Text)", "tts (Text-to-Speech)", "translate", "agents"].map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px] py-0 font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !keyName.trim()} className="h-8 text-xs gap-1.5">
                {creating ? <Spinner className="size-3.5" /> : null}
                Generate Key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Reveal Secret Key Dialog */}
      <Dialog
        open={!!revealedKey}
        onOpenChange={(open) => {
          if (!open) setRevealedKey(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="size-10 rounded-full bg-success/10 text-success flex items-center justify-center mb-2">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-5" />
            </div>
            <DialogTitle className="text-base font-semibold">Save your secret API key</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Please copy this key now. For your security, <strong className="text-foreground">you will not be able to view it again</strong> once you close this window.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <div className="relative">
              <Input
                readOnly
                value={revealedKey?.raw_key || ""}
                className="h-10 font-mono text-xs pr-20 bg-muted/50 border-primary/30"
              />
              <Button
                size="sm"
                onClick={() => revealedKey && handleCopyKey(revealedKey.raw_key)}
                className="absolute right-1 top-1 h-8 px-3 text-xs gap-1.5"
              >
                <HugeiconsIcon
                  icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
                  className="size-3.5"
                />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-warning/5 border border-warning/15 text-warning text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <HugeiconsIcon icon={Alert01Icon} className="size-3.5 shrink-0" />
                Security Notice
              </p>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Do not expose this key in client-side repositories or public code. Treat it like a password.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setRevealedKey(null)}
              className="h-8 text-xs font-medium w-full sm:w-auto"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
