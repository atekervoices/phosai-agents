"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardCircleIcon,
  ActivityIcon,
  VoiceIcon,
  Robot01Icon,
  CallInternal02Icon,
  ConnectIcon,
  ArrowRight01Icon,
  ChartHistogramIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";

interface AdminOverviewData {
  status: string;
  system_version: string;
  active_calls: number;
  total_calls: number;
  completed_calls: number;
  total_agents: number;
  total_phone_numbers: number;
  total_credentials: number;
  avg_call_duration_seconds: number;
  uptime_percentage: number;
  voice_server_status: string;
  voice_engine_latency_ms: number;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<Array<{ date: string; total: number; completed: number; failed: number }>>([]);
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; total: number } | null>(null);

  useEffect(() => {
    async function fetchOverview() {
      try {
        const [resOverview, resAnalytics] = await Promise.all([
          fetch("/api-proxy/admin/overview"),
          fetch("/api-proxy/admin/analytics?timeframe=7d")
        ]);
        if (resOverview.ok) {
          const json = await resOverview.json();
          setData(json);
        }
        if (resAnalytics.ok) {
          const jsonAnal = await resAnalytics.json();
          setTrend(jsonAnal.call_volume_trend || []);
        }
      } catch (err) {
        console.error("Failed to fetch admin overview:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchOverview();
  }, []);

  const totalCallsCount = trend.reduce((acc, pt) => acc + pt.total, 0);
  const rawMax = Math.max(...trend.map((pt) => pt.total), 0);
  const tickMax = rawMax <= 5 ? 10 : Math.ceil(rawMax / 10) * 10;
  const yTicks = [
    tickMax,
    Math.round(tickMax * 0.75),
    Math.round(tickMax * 0.5),
    Math.round(tickMax * 0.25),
    0,
  ];

  const calcY = (val: number) => 100 - (val / tickMax) * 100;

  const pointsString = trend
    .map((pt, idx) => {
      const x = (idx / (trend.length - 1 || 1)) * 100;
      const y = calcY(pt.total);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <PageHeader
          icon={DashboardCircleIcon}
          title="Platform Overview"
          description="Real-time multi-tenant telephony telemetry, user quotas, and call volume graphs."
        />
      </div>

      {/* Primary KPI Cards Grid — Unified Golden Yellow Icons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Streams */}
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 hover:ring-primary/20 p-5 space-y-2 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Streams</span>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <HugeiconsIcon icon={ActivityIcon} className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {loading ? "..." : data?.active_calls}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Live audio WebSocket streams
          </p>
        </div>

        {/* Total Calls */}
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 hover:ring-primary/20 p-5 space-y-2 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Calls Handled</span>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <HugeiconsIcon icon={VoiceIcon} className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {loading ? "..." : (data?.total_calls || 0).toLocaleString()}
          </div>
          <p className="text-xs text-emerald-500 font-medium flex items-center gap-1">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
            {data?.completed_calls || 0} successful sessions
          </p>
        </div>

        {/* Total Agents */}
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 hover:ring-primary/20 p-5 space-y-2 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Provisioned Agents</span>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <HugeiconsIcon icon={Robot01Icon} className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {loading ? "..." : data?.total_agents}
          </div>
          <p className="text-xs text-muted-foreground">Across all workspace tenants</p>
        </div>

        {/* Telephony Phone Numbers */}
        <div className="rounded-xl bg-card ring-1 ring-foreground/10 hover:ring-primary/20 p-5 space-y-2 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Telephony Phone Numbers</span>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <HugeiconsIcon icon={CallInternal02Icon} className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {loading ? "..." : data?.total_phone_numbers}
          </div>
          <p className="text-xs text-muted-foreground">Telnyx / Twilio SIP trunks</p>
        </div>
      </div>

      {/* Sleek Golden Thin Line Graph Card */}
      <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Platform 7-Day Call Volume Graph</h3>
            <p className="text-xs text-muted-foreground">Daily voice session activity over the past 7 days</p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
            7-Day Activity
          </span>
        </div>

        {/* Clean Line Graph Canvas */}
        <div className="space-y-3 pt-2">
          <div className="flex items-stretch gap-3">
            {/* Left Y-Axis Label Column */}
            <div className="w-10 flex flex-col justify-between text-right text-[11px] font-mono text-muted-foreground py-0.5 select-none">
              {yTicks.map((tick, i) => (
                <span key={i} className="leading-none">
                  {tick}
                </span>
              ))}
            </div>

            {/* Main Chart Canvas Box */}
            <div className="relative flex-1 h-56 border-b border-border/80">
              {/* Horizontal Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-border w-full"></div>
              </div>

              {totalCallsCount === 0 && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="px-4 py-2 rounded-lg bg-card/95 border border-border text-xs font-mono text-muted-foreground">
                    No call traffic recorded for this timeframe. Test calls will plot here live.
                  </div>
                </div>
              )}

              {/* Golden Yellow Crisp Thin Line SVG */}
              <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="overviewGoldLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#eab308" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#eab308" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,100 ${pointsString} 100,100`} fill="url(#overviewGoldLineGrad)" />
                <polyline
                  points={pointsString}
                  fill="none"
                  stroke="#eab308"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Data Points on Exact Line Vertices */}
              <div className="absolute inset-0 pointer-events-none">
                {trend.map((pt, idx) => {
                  const xPct = (idx / (trend.length - 1 || 1)) * 100;
                  const yPct = calcY(pt.total);
                  const isHovered = hoveredPoint?.date === pt.date;

                  return (
                    <div
                      key={idx}
                      style={{ left: `${xPct}%`, top: `${yPct}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group"
                      onMouseEnter={() => setHoveredPoint(pt)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-lg bg-popover text-popover-foreground border border-border text-xs whitespace-nowrap space-y-0.5 pointer-events-none">
                          <div className="font-semibold text-primary">{pt.date}: {pt.total} Calls</div>
                        </div>
                      )}

                      {/* Golden Vertex Dot */}
                      <div
                        className={`size-2.5 rounded-full border-2 border-background bg-primary transition-all duration-200 ${
                          isHovered ? "scale-150 ring-4 ring-primary/30" : "group-hover:scale-125"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom X-Axis Date Labels Row */}
          <div className="pl-13 pr-1 flex justify-between text-[11px] font-mono text-muted-foreground pt-1">
            {trend.map((pt, idx) => (
              <span key={idx} className="hover:text-foreground transition-colors cursor-default font-medium">
                {pt.date}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
