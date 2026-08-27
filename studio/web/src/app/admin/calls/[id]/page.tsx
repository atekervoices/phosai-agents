"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  VoiceIcon,
  Clock01Icon,
  Robot01Icon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

interface CallDetail {
  id: string;
  agent_id?: string;
  agent_name?: string;
  status?: string;
  duration_seconds?: number;
  caller_number?: string;
  callee_number?: string;
  recording_url?: string;
  transcript_json?: any;
  created_at?: string;
  started_at?: string;
  ended_at?: string;
}

export default function AdminCallDetailPage() {
  const params = useParams<{ id: string }>();
  const callId = params?.id;

  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) return;

    async function fetchCallDetail() {
      try {
        setLoading(true);
        const res = await fetch(`/api-proxy/calls/${callId}`);
        if (res.ok) {
          const json = await res.json();
          setCall(json);
          setError(null);
        } else {
          setError(`Call session ID '${callId}' not found in database.`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load call detail.");
      } finally {
        setLoading(false);
      }
    }

    fetchCallDetail();
  }, [callId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/calls">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            Back to Admin Call Logs
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs font-mono text-muted-foreground">
          Loading call session telemetry...
        </div>
      ) : error || !call ? (
        <div className="rounded-xl bg-card border border-border p-12 text-center space-y-4 max-w-lg mx-auto">
          <div className="size-12 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
            <HugeiconsIcon icon={AlertCircleIcon} className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">Call Session Not Found</h3>
            <p className="text-xs text-muted-foreground">{error || "The requested call ID does not exist."}</p>
          </div>
          <div className="pt-2">
            <Link href="/admin/calls">
              <Button size="sm" className="rounded-lg text-xs font-semibold">
                Return to Call Logs
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <PageHeader
            icon={VoiceIcon}
            title={`Call Session: ${call.id.slice(0, 8)}...`}
            description={`Recorded session for ${call.agent_name || "Voice Agent"} on ${new Date(call.created_at || Date.now()).toLocaleString()}`}
          />

          {/* Call Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-card border border-border p-4 space-y-1">
              <span className="text-[11px] font-mono text-muted-foreground">STATUS</span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  {call.status || "completed"}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-card border border-border p-4 space-y-1">
              <span className="text-[11px] font-mono text-muted-foreground">TALK TIME</span>
              <div className="text-lg font-bold text-foreground font-mono">
                {call.duration_seconds || 0} seconds
              </div>
            </div>

            <div className="rounded-xl bg-card border border-border p-4 space-y-1">
              <span className="text-[11px] font-mono text-muted-foreground">AGENT NAME</span>
              <div className="text-sm font-semibold text-foreground">
                {call.agent_name || "Standard Voice Agent"}
              </div>
            </div>
          </div>

          {/* Audio & Transcript Card */}
          <div className="rounded-xl bg-card border border-border p-6 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Session Transcript</h3>

            {!call.transcript_json ? (
              <div className="py-8 text-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded-lg">
                No transcript text recorded for this session.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {Array.isArray(call.transcript_json) ? (
                  call.transcript_json.map((turn: any, idx: number) => (
                    <div key={idx} className="flex gap-3 text-xs leading-relaxed">
                      <span className="font-mono text-primary font-semibold w-16 shrink-0 uppercase">
                        {turn.role || "speaker"}
                      </span>
                      <span className="text-foreground/90">{turn.text || turn.content}</span>
                    </div>
                  ))
                ) : (
                  <pre className="text-xs font-mono text-foreground/80 bg-muted/40 p-4 rounded-lg overflow-x-auto">
                    {JSON.stringify(call.transcript_json, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
