"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ChartHistogramIcon,
  Clock01Icon,
  VoiceIcon,
  Robot01Icon,
  SmartPhoneIcon,
  ActivityIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";

interface CallTrendPoint {
  date: string;
  completed: number;
  failed: number;
  user_hungup: number;
  total: number;
}

interface AnalyticsData {
  timeframe: string;
  call_volume_trend: CallTrendPoint[];
  top_agents?: Array<{ id: string; name: string; call_count: number }>;
  concurrency_analytics?: {
    peak_concurrent_channels: number;
    max_capacity_channels: number;
    utilization_percentage: number;
  };
  disconnect_reasons?: Array<{
    reason: string;
    percentage: number;
    count: number;
  }>;
}

export default function AdminAnalyticsPage() {
  const [timeframe, setTimeframe] = useState<"7d" | "30d" | "90d">("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<CallTrendPoint | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const res = await fetch(`/api-proxy/admin/analytics?timeframe=${timeframe}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to load analytics:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [timeframe]);

  const trend = data?.call_volume_trend || [];
  const totalCalls = trend.reduce((acc, t) => acc + t.total, 0);
  const estCallMinutes = Math.round(totalCalls * 2.4);

  const rawMax = Math.max(...trend.map((t) => t.total), 0);
  // Sensible scale max: minimum 10 for low call volumes (shows 10, 8, 5, 2, 0)
  const tickMax = rawMax <= 5 ? 10 : Math.ceil(rawMax / 10) * 10;
  
  const yTicks = [
    tickMax,
    Math.round(tickMax * 0.75),
    Math.round(tickMax * 0.5),
    Math.round(tickMax * 0.25),
    0,
  ];

  // Exact 0..100 percentage projection
  const calcY = (val: number) => 100 - (val / tickMax) * 100;

  // Filter X-axis labels so long timeframes (30d/90d) don't overlap
  const labelStep = Math.max(1, Math.floor((trend.length - 1) / 6));
  const showDotsPermanently = trend.length <= 14;

  const concurrency = data?.concurrency_analytics || {
    peak_concurrent_channels: 0,
    max_capacity_channels: 100,
    utilization_percentage: 0.0,
  };

  const topAgents = data?.top_agents || [];

  const disconnects = data?.disconnect_reasons || [
    { reason: "Agent Completed Goal", percentage: 0.0, count: 0 },
    { reason: "User Ended Call", percentage: 0.0, count: 0 },
    { reason: "System Error / Failed", percentage: 0.0, count: 0 },
  ];

  // Compute SVG Line points
  const pointsString = trend
    .map((pt, idx) => {
      const x = (idx / (trend.length - 1 || 1)) * 100;
      const y = calcY(pt.total);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="space-y-8">
      {/* Header & Filter */}
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          icon={ChartHistogramIcon}
          title="Voice Platform Analytics & Line Graphs"
          description="Visual call volume trends, line graphs, and SIP channel concurrency telemetry."
        />

        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-card border border-border shadow-sm">
          {(["7d", "30d", "90d"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                timeframe === t
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Top High-Level Analytics Cards — 3 Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-card border border-border p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total Call Volume</span>
            <HugeiconsIcon icon={VoiceIcon} className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">{totalCalls.toLocaleString()}</div>
          <div className="text-[11px] text-primary font-medium flex items-center gap-1">
            <span>Operational session volume ({timeframe.toUpperCase()})</span>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Est. Call Talk Time</span>
            <HugeiconsIcon icon={Clock01Icon} className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {estCallMinutes.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">mins</span>
          </div>
          <div className="text-[11px] text-primary font-medium">Avg 2m 24s per call</div>
        </div>

        <div className="rounded-xl bg-card border border-border p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Peak Channel Concurrency</span>
            <HugeiconsIcon icon={ActivityIcon} className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {concurrency.peak_concurrent_channels}{" "}
            <span className="text-xs font-normal text-muted-foreground">/ {concurrency.max_capacity_channels} SIP lines</span>
          </div>
          <div className="text-[11px] text-primary font-medium">
            {concurrency.utilization_percentage}% peak channel capacity
          </div>
        </div>
      </div>

      {/* Main Full-Width Call Volume Trend Line Graph */}
      <div className="w-full rounded-xl bg-card border border-border p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Call Volume & Outcome Breakdown</h3>
            <p className="text-xs text-muted-foreground">Daily call activity categorized by call status ({timeframe.toUpperCase()})</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-primary">
              <span className="size-2.5 rounded-full bg-primary"></span> Total Volume
            </span>
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="size-2.5 rounded-full bg-emerald-500"></span> Completed
            </span>
            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="size-2.5 rounded-full bg-rose-500"></span> Failed
            </span>
          </div>
        </div>

        {/* Clean Chart Container with Dedicated Y-Axis Column & Canvas */}
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
            <div className="relative flex-1 h-60 border-b border-border/80">
              {/* Horizontal Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-dashed border-border w-full"></div>
                <div className="border-b border-border w-full"></div>
              </div>

              {totalCalls === 0 && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                  <div className="px-4 py-2 rounded-lg bg-card/95 border border-border text-xs font-mono text-muted-foreground shadow-sm">
                    No call traffic recorded for this timeframe. Test calls will plot here live.
                  </div>
                </div>
              )}

              {/* Golden Yellow Crisp Thin Line SVG */}
              <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="goldLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#eab308" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#eab308" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,100 ${pointsString} 100,100`} fill="url(#goldLineGrad)" />
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
                        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-lg bg-popover text-popover-foreground border border-border shadow-xl text-xs whitespace-nowrap space-y-0.5 pointer-events-none">
                          <div className="font-semibold text-primary">{pt.date}: {pt.total} Calls</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            <span className="text-emerald-400">{pt.completed} Completed</span> | <span className="text-rose-400">{pt.failed} Failed</span>
                          </div>
                        </div>
                      )}

                      {/* Golden Vertex Dot (Only visible permanently on short 7D view or on hover) */}
                      <div
                        className={`size-2.5 rounded-full border-2 border-background bg-primary transition-all duration-200 ${
                          isHovered
                            ? "scale-150 ring-4 ring-primary/30 opacity-100"
                            : showDotsPermanently
                            ? "opacity-100 group-hover:scale-125"
                            : "opacity-0 group-hover:opacity-100 group-hover:scale-125"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom X-Axis Date Labels Row (Evenly Spaced) */}
          <div className="pl-13 pr-1 flex justify-between text-[11px] font-mono text-muted-foreground pt-1">
            {trend.map((pt, idx) => {
              const isVisible = idx % labelStep === 0 || idx === trend.length - 1;
              if (!isVisible) return <span key={idx} className="hidden sm:inline" />;
              return (
                <span key={idx} className="hover:text-foreground transition-colors cursor-default font-medium">
                  {pt.date}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Grid: Call Disconnect Reasons & Top Agent Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Call Termination & Disconnect Reasons */}
        <div className="rounded-xl bg-card border border-border p-6 space-y-4 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold text-foreground">Call Termination & Disconnect Reasons</h3>
              <p className="text-xs text-muted-foreground">Categorized end conditions & AMD detections</p>
            </div>
            <HugeiconsIcon icon={SmartPhoneIcon} className="size-5 text-primary" />
          </div>

          <div className="space-y-3.5 pt-1">
            {disconnects.map((disc, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground font-medium">{disc.reason}</span>
                  <span className="font-mono text-muted-foreground">{disc.percentage}% ({disc.count})</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${disc.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Voice Agents Leaderboard */}
        <div className="rounded-xl bg-card border border-border p-6 space-y-4 shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold text-foreground">Top Agent Utilization Leaderboard</h3>
              <p className="text-xs text-muted-foreground">Most active agents by call volume</p>
            </div>
            <HugeiconsIcon icon={Robot01Icon} className="size-5 text-primary" />
          </div>

          <div className="space-y-3.5 pt-1">
            {topAgents.length === 0 ? (
              <div className="py-10 text-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded-lg">
                No active agent call traffic recorded for this timeframe.
              </div>
            ) : (
              topAgents.map((agent, i) => {
                const maxAgentCalls = Math.max(...topAgents.map((a) => a.call_count), 1);
                const pct = (agent.call_count / maxAgentCalls) * 100;

                return (
                  <div key={agent.id || i} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground font-medium flex items-center gap-2">
                        <span className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                          {i + 1}
                        </span>
                        {agent.name}
                      </span>
                      <span className="font-mono text-muted-foreground">{agent.call_count} calls</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
