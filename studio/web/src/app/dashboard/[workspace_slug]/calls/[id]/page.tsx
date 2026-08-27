"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { CallHeader } from "@/components/call-detail/call-header";
import { LogTab } from "@/components/call-detail/log-tab";
import { CallWaveform } from "@/components/call-detail/call-waveform";
import { TranscriptTab } from "@/components/call-detail/transcript-tab";
import { extractTranscriptMessages, parseTranscript } from "@/components/call-detail/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  api,
  API_BASE,
  type CallEvent,
  type CallLog,
  type CallLogCapabilities,
} from "@/lib/api/client";

function getAbsoluteUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

type TabKey = "transcript" | "log";

function CallDetailPageContent() {
  const params = useParams();
  const workspace_slug = (params?.workspace_slug as string) || "default";
  const callId = (params?.id as string) || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CallLog | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("transcript");
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [logCapabilities, setLogCapabilities] = useState<CallLogCapabilities | null>(null);
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) return;

    let cancelled = false;
    setLoading(true);

    api.calls
      .get(callId)
      .then((data) => {
        if (cancelled) return;
        setCall(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load call detail.");
        setCall(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    api.calls
      .getLogCapabilities(callId)
      .then((data) => {
        if (cancelled) return;
        setLogCapabilities(data);
      })
      .catch(() => {
        if (cancelled) return;
        setLogCapabilities(null);
      });

    return () => {
      cancelled = true;
    };
  }, [callId]);

  useEffect(() => {
    if (!callId || !logCapabilities?.has_internal_logs) return;

    let cancelled = false;
    setTimeout(() => {
      setEventsLoading(true);
      setEventsError(null);
    }, 0);
    api.calls
      .getEvents(callId, 0, 500)
      .then((data) => {
        if (cancelled) return;
        setEvents(data.events);
      })
      .catch((err) => {
        if (cancelled) return;
        setEventsError(err instanceof Error ? err.message : "Failed to load call events.");
        setEvents([]);
      })
      .finally(() => {
        if (cancelled) return;
        setEventsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [callId, logCapabilities?.has_internal_logs]);

  const parsedTranscript = useMemo(() => parseTranscript(call?.transcript_json), [call]);
  const audioUrl = useMemo(
    () => getAbsoluteUrl(parsedTranscript?.audio_url ?? call?.recording_url ?? null),
    [parsedTranscript, call?.recording_url]
  );
  const transcriptMessages = useMemo(
    () => extractTranscriptMessages(parsedTranscript),
    [parsedTranscript]
  );

  const activeTranscriptIndex = useMemo(() => {
    let activeIndex = -1;
    for (let i = 0; i < transcriptMessages.length; i += 1) {
      const offset = transcriptMessages[i]?.offsetSecRaw;
      if (offset == null) continue;
      if (offset <= currentTimeSec) {
        activeIndex = i;
      }
    }
    return activeIndex;
  }, [transcriptMessages, currentTimeSec]);

  const canShowLogTab =
    (logCapabilities?.has_internal_logs ?? false) ||
    (logCapabilities?.external_links?.length ?? 0) > 0;
  const langfuseLink = useMemo(() => {
    const active = (logCapabilities?.active_adapters ?? []).some(
      (name) => name.toLowerCase() === "langfuse"
    );
    if (!active) return null;
    return (
      (logCapabilities?.external_links ?? []).find(
        (link) => link.adapter.toLowerCase() === "langfuse"
      ) ?? null
    );
  }, [logCapabilities]);

  // Sync tab state if capabilities change
  useEffect(() => {
    if (activeTab === "log" && logCapabilities && !canShowLogTab) {
      setTimeout(() => setActiveTab("transcript"), 0);
    }
  }, [activeTab, canShowLogTab, logCapabilities]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-secondary/30 animate-pulse" />
        <div className="h-52 rounded-xl bg-secondary/30 animate-pulse" />
        <div className="h-64 rounded-xl bg-secondary/30 animate-pulse" />
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="space-y-4">
        <Link href={`/dashboard/${workspace_slug}/calls`}>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            Back to Calls
          </Button>
        </Link>
        <div className="flat-card p-10 text-center">
          <p className="text-sm text-foreground font-medium">Unable to open call detail</p>
          <p className="text-sm text-muted-foreground mt-1">{error ?? "Call not found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href={`/dashboard/${workspace_slug}/calls`}>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            Back to Calls
          </Button>
        </Link>
      </div>

      <CallHeader call={call} langfuseLink={langfuseLink?.url ?? null} />

      <CallWaveform
        recordingUrl={audioUrl ?? getAbsoluteUrl(call?.recording_url) ?? null}
        fallbackDurationSec={call?.duration_seconds}
        onTimeUpdate={setCurrentTimeSec}
      />

      <section className="space-y-3">
        <div className="flex items-center gap-1 border-b border-border/70 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("transcript")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === "transcript"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Transcript ({transcriptMessages.length})
          </button>
          {canShowLogTab ? (
            <button
              type="button"
              onClick={() => setActiveTab("log")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === "log"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              System Log
            </button>
          ) : null}
        </div>

        {activeTab === "transcript" ? (
          <TranscriptTab messages={transcriptMessages} activeIndex={activeTranscriptIndex} />
        ) : (
          <LogTab
            hasInternalLogs={logCapabilities?.has_internal_logs ?? false}
            events={events}
            eventsLoading={eventsLoading}
            eventsError={eventsError}
            externalLinks={logCapabilities?.external_links ?? []}
            totalDurationSec={call.duration_seconds}
          />
        )}
      </section>
    </div>
  );
}

export default function CallDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-24 rounded-xl bg-secondary/30 animate-pulse" />
          <div className="h-52 rounded-xl bg-secondary/30 animate-pulse" />
          <div className="h-64 rounded-xl bg-secondary/30 animate-pulse" />
        </div>
      }
    >
      <CallDetailPageContent />
    </Suspense>
  );
}
