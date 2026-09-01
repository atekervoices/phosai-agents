"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  VoiceIcon,
  Robot01Icon,
  Clock01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";

interface CallRecord {
  id: string;
  agent_id?: string;
  status?: string;
  duration_seconds?: number;
  created_at?: string;
  disconnect_reason?: string;
  caller_number?: string;
}

export default function AdminCallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCalls() {
      try {
        const res = await fetch("/api-proxy/calls?limit=100");
        if (res.ok) {
          const json = await res.json();
          setCalls(json.calls || json || []);
        }
      } catch (err) {
        console.error("Failed to fetch admin call logs:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCalls();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={VoiceIcon}
        title="Call Logs & Audio Observability"
        description="System-wide real-time call logs, duration telemetry, and disconnect reasons."
      />

      {/* Call Logs Table */}
      <div className="rounded-xl bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Recent Voice Sessions</h3>
          <span className="text-xs font-mono text-muted-foreground">{calls.length} Total Logs</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-muted-foreground">
            Loading call logs...
          </div>
        ) : calls.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border rounded-xl space-y-3">
            <div className="size-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <HugeiconsIcon icon={VoiceIcon} className="size-5" />
            </div>
            <div className="text-sm font-semibold text-foreground">No Call Logs Found</div>
            <p className="text-xs text-muted-foreground">
              No voice calls have been recorded yet. Test calls will appear here live.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted/30 text-muted-foreground font-mono">
                <tr>
                  <th className="py-3 px-4">Call ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Disconnect Reason</th>
                  <th className="py-3 px-4">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {calls.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => window.location.href = `/admin/calls/${c.id}`}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-foreground">
                      <Link href={`/admin/calls/${c.id}`} className="hover:text-primary hover:underline">
                        {c.id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                          c.status === "completed" || c.status === "ended"
                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                        }`}
                      >
                        {c.status || "completed"}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {c.duration_seconds || 0}s
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {c.disconnect_reason || "Agent Completed Goal"}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : "Recently"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
