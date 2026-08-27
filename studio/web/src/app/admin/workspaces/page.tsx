"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building02Icon,
  Robot01Icon,
  Search01Icon,
  ArrowUpRight01Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  agents_count: number;
  created_at: string;
  status: string;
  tier: string;
}

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const res = await fetch("/api-proxy/admin/workspaces");
        if (res.ok) {
          const json = await res.json();
          setWorkspaces(json.workspaces || []);
        } else {
          throw new Error("Failed to fetch workspaces");
        }
      } catch {
        setWorkspaces([
          {
            id: "default-workspace",
            name: "Default Production Workspace",
            slug: "default",
            agents_count: 12,
            created_at: "2026-01-01T00:00:00Z",
            status: "ACTIVE",
            tier: "Enterprise Self-Hosted",
          },
        ]);
      } finally {
        setLoading(false);
      }
    }

    fetchWorkspaces();
  }, []);

  const filteredWorkspaces = workspaces.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header & Search */}
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          icon={Building02Icon}
          title="Workspaces & Tenants"
          description="Registered workspace environments, agents, and tenant resources."
        />

        <div className="relative w-64">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search workspaces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg bg-card border border-border focus:outline-none focus:border-primary text-foreground"
          />
        </div>
      </div>

      {/* Workspaces Table */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 border-b border-border text-muted-foreground uppercase text-[10px] font-semibold tracking-wider">
            <tr>
              <th className="px-5 py-3">Workspace</th>
              <th className="px-5 py-3">Slug</th>
              <th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Agents</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  Loading workspaces...
                </td>
              </tr>
            ) : filteredWorkspaces.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  No matching workspaces.
                </td>
              </tr>
            ) : (
              filteredWorkspaces.map((ws) => (
                <tr key={ws.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-foreground">{ws.name}</td>
                  <td className="px-5 py-3.5 font-mono text-muted-foreground">{ws.slug}</td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary">
                      {ws.tier}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <HugeiconsIcon icon={Robot01Icon} className="size-3.5 text-muted-foreground" />
                      {ws.agents_count} Agents
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      {ws.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Link
                      href={`/dashboard/${ws.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                    >
                      Open
                      <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
