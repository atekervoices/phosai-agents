"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  AiScanIcon,
  HardDriveUploadIcon,
  Robot01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { useEffect, useState, Suspense } from "react";
import { api, type Agent } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import AgentListItemCard from "@/components/agent/agent-list-item-card";
import Link from "next/link";
import { useParams } from "next/navigation";

function AgentsPageContent() {
  const params = useParams();
  const workspace_slug = (params?.workspace_slug as string) || "default";
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [skip, setSkip] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const limit = 50;

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const loadAgents = async (currentSkip: number, isInitial = false) => {
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await api.agents.list(currentSkip, limit, debouncedSearchQuery || undefined);
      setAgents((prev) => (isInitial ? data.agents : [...prev, ...data.agents]));
      setHasMore(data.agents.length === limit);
    } catch {
      // ignore
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    setSkip(0);
    loadAgents(0, true);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
          document.documentElement.offsetHeight - 200 &&
        hasMore &&
        !loadingMore &&
        !loading
      ) {
        const nextSkip = skip + limit;
        setSkip(nextSkip);
        loadAgents(nextSkip);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadingMore, loading, skip, debouncedSearchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          icon={AiScanIcon}
          title="Agents"
          description="Create, search, and manage your voice agents."
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative group w-full sm:w-auto">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors"
            />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full sm:w-44 rounded-md bg-secondary pl-9 pr-3 text-xs focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground transition-all"
            />
          </div>
          <Link href={`/dashboard/${workspace_slug}/agents/new`} className="flex-1 sm:flex-initial">
            <Button size="sm" className="h-8 w-full px-4 text-xs font-medium gap-1.5">
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" /> Create agent
            </Button>
          </Link>
          <Link href={`/dashboard/${workspace_slug}/agents/import`} className="flex-1 sm:flex-initial">
            <Button size="sm" variant="outline" className="h-8 w-full px-4 text-xs font-medium gap-1.5">
              <HugeiconsIcon icon={HardDriveUploadIcon} className="size-3.5" /> Import
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="py-16 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-xl bg-primary/10 mb-4">
            <HugeiconsIcon icon={Robot01Icon} className="size-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No agents found</p>
          <p className="text-xs text-muted-foreground max-w-[280px] mx-auto mb-5">
            {debouncedSearchQuery
              ? `No voice agents match "${debouncedSearchQuery}". Try clearing your search.`
              : "Create your first voice agent to start handling calls."}
          </p>
          <Link href={`/dashboard/${workspace_slug}/agents/new`}>
            <Button size="sm" className="h-8 rounded-lg px-5 text-xs font-medium gap-1.5">
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" /> Create agent
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {agents
            .filter((agent) =>
              agent.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
            )
            .map((agent) => (
              <AgentListItemCard
                key={agent.id}
                agent={agent}
                href={`/dashboard/${workspace_slug}/agents/${agent.id}`}
              />
            ))}
        </div>
      )}
      {loadingMore && (
        <div className="py-4 text-center">
          <Spinner className="inline-block size-6 text-primary" />
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
          <div className="h-44 rounded-xl bg-secondary/30 animate-pulse" />
        </div>
      }
    >
      <AgentsPageContent />
    </Suspense>
  );
}
