"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DatabaseIcon,
  Robot01Icon,
  File02Icon,
  Loading03Icon,
  Search01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import KnowledgePanel from "@/components/agent/knowledge-panel";
import { api, type Agent } from "@/lib/api/client";

interface KnowledgeBaseItem {
  id: string;
  agent_id: string;
  name: string;
  description: string | null;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  document_count: number;
  total_chunks: number;
  created_at: string;
}

export default function KnowledgePage() {
  const params = useParams();
  const workspaceSlug = (params?.workspace_slug as string) || "default";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Fetch agents
        const agentsRes = await api.getAgents();
        if (agentsRes.data) {
          setAgents(agentsRes.data);
          if (agentsRes.data.length > 0 && !selectedAgentId) {
            setSelectedAgentId(agentsRes.data[0].id);
          }
        }

        // Fetch all knowledge bases
        const kbRes = await fetch("/api/knowledge-bases");
        if (kbRes.ok) {
          const kbs = await kbRes.json();
          setKnowledgeBases(kbs);
        }
      } catch (err) {
        console.error("Failed to load knowledge bases:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Header */}
      <div className="px-6 py-5 border-b border-border/60 bg-background/50 backdrop-blur-md">
        <PageHeader
          icon={DatabaseIcon}
          title="Knowledge Base"
          description="Upload documents (PDF, Word, Text) so your voice agents can accurately answer caller questions in real time."
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground mr-1 hidden sm:inline">
                Scope to Agent:
              </span>
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-accent/20 border border-border/40 backdrop-blur-sm">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 select-none ${
                      selectedAgentId === agent.id
                        ? "bg-background text-foreground shadow-sm ring-1 ring-border/20 font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                    }`}
                  >
                    <HugeiconsIcon icon={Robot01Icon} className="size-3.5 text-primary" />
                    <span>{agent.name}</span>
                  </button>
                ))}
              </div>
            </div>
          }
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden bg-background/30">
        {loading ? (
          <div className="flex h-96 items-center justify-center">
            <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-primary" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 space-y-3 text-center p-6">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon icon={Robot01Icon} className="size-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">No Agents Created Yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              Create your first voice agent in the Agents tab before linking a knowledge base.
            </p>
          </div>
        ) : selectedAgentId ? (
          <KnowledgePanel agentId={selectedAgentId} />
        ) : null}
      </div>
    </div>
  );
}
