"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Robot01Icon,
  Search01Icon,
  Add01Icon,
  Clock01Icon,
  VoiceIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

interface AdminAgent {
  id: string;
  name: string;
  system_prompt?: string;
  model_name?: string;
  voice_id?: string;
  created_at?: string;
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api-proxy/agents?limit=100");
        if (res.ok) {
          const json = await res.json();
          setAgents(json.agents || []);
        }
      } catch (err) {
        console.error("Failed to load agents:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAgents();
  }, []);

  const filteredAgents = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          icon={Robot01Icon}
          title="Voice Agents Management"
          description="System-wide configured voice agents and prompt definitions."
        />
        <Link
          href="/dashboard/default/agents/new"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Create New Agent
        </Link>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        />
        <input
          type="text"
          placeholder="Search agents by name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Agents Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs font-mono text-muted-foreground">
          Loading system voice agents...
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-border rounded-xl space-y-3">
          <div className="size-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
            <HugeiconsIcon icon={Robot01Icon} className="size-5" />
          </div>
          <div className="text-sm font-semibold text-foreground">No Voice Agents Found</div>
          <p className="text-xs text-muted-foreground">
            No voice agents match your search or exist in the database.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-xl bg-card border border-border p-5 space-y-4 hover:border-primary/50 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                    <HugeiconsIcon icon={Robot01Icon} className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {agent.name}
                    </h4>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      ID: {agent.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/40">
                <div className="flex justify-between">
                  <span>Model:</span>
                  <span className="font-mono text-foreground">{agent.model_name || "gpt-4o-mini"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Voice Engine:</span>
                  <span className="font-mono text-foreground">{agent.voice_id || "elevenlabs / cartesia"}</span>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-end gap-2">
                <Link
                  href={`/dashboard/default/agents/${agent.id}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
                >
                  Configure & Prompt
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
