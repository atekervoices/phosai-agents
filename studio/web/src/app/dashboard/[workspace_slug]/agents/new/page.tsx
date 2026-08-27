"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  AiBrowserIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { useState, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";

function NewAgentPageContent() {
  const params = useParams();
  const workspace_slug = (params?.workspace_slug as string) || "default";
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const agent = await api.agents.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/dashboard/${workspace_slug}/agents/${agent.id}`);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Create Voice Agent</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Give your AI assistant a name and purpose to get started
          </p>
        </div>
        <Link href={`/dashboard/${workspace_slug}/agents`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            Cancel
          </Button>
        </Link>
      </div>

      <Card className="flat-card p-6">
        <CardContent className="p-0 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Agent Name *</label>
            <Input
              placeholder="e.g. Sales Support Bot, Appointment Scheduler..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
              className="bg-background text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Description (Optional)</label>
            <Textarea
              placeholder="Describe what this agent will do..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-background text-xs resize-none"
            />
          </div>

          <div className="pt-4 border-t border-border/60 flex items-center justify-between">
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="gap-2 px-6"
            >
              {creating ? (
                <>
                  <Spinner className="size-4" /> Creating Agent...
                </>
              ) : (
                <>
                  Initialize Voice Agent{" "}
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className="size-4 group-hover:translate-x-1 transition-transform"
                  />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewAgentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading...</div>}>
      <NewAgentPageContent />
    </Suspense>
  );
}
