"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  LanguageCircleIcon,
  Robot01Icon,
  TimeZoneIcon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";

import type { Agent } from "@/lib/api/client";

type AgentListItemCardProps = {
  agent: Agent;
  href: string;
  className?: string;
};

function getLanguageFromConfig(config: Agent["current_config"]): string | null {
  if (!config || typeof config !== "object") return null;
  const language =
    "language" in config && typeof config.language === "string"
      ? config.language
      : "identity" in config &&
          config.identity &&
          typeof config.identity === "object" &&
          "language" in config.identity &&
          typeof config.identity.language === "string"
        ? config.identity.language
        : null;
  return language?.trim() || null;
}

function getTimezoneFromConfig(config: Agent["current_config"]): string | null {
  if (!config || typeof config !== "object") return null;
  const timezone =
    "timezone" in config && typeof config.timezone === "string" ? config.timezone : null;
  return timezone?.trim() || null;
}

function formatLanguageLabel(rawLanguage: string): string {
  const normalized = rawLanguage.replace("_", "-").trim();
  if (!normalized) return rawLanguage;
  const baseCode = normalized.split("-")[0].toLowerCase();
  try {
    const display = new Intl.DisplayNames(["en"], { type: "language" }).of(baseCode);
    if (display) return display;
  } catch {
    // Fallback below
  }
  return baseCode.toUpperCase();
}

function VersionBadge({
  label,
  version,
  tone,
}: {
  label: "current" | "active";
  version: number;
  tone: "neutral" | "accent";
}) {
  const isAccent = tone === "accent";
  return (
    <span
      className={`inline-flex h-5.5 items-center overflow-hidden rounded-md border text-[10px] font-semibold tracking-wide shrink-0 ${
        isAccent
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-border bg-secondary/50 text-muted-foreground"
      }`}
    >
      <span className="px-2 uppercase font-bold">{label}</span>
      <span
        className={`border-l px-1.5 font-mono ${
          isAccent ? "border-amber-500/30" : "border-border"
        }`}
      >
        v{version}
      </span>
    </span>
  );
}

export default function AgentListItemCard({ agent, href, className }: AgentListItemCardProps) {
  const targetHref = href || `/dashboard/default/agents/${agent.id}`;
  const description = agent.description?.trim() || "";
  const currentVersion = agent.version_count > 0 ? agent.version_count : null;
  const activeVersion = agent.active_version;

  const showCurrent =
    currentVersion !== null && (activeVersion === null || activeVersion !== currentVersion);
  const showActive = activeVersion !== null;

  const rawLanguage = getLanguageFromConfig(agent.current_config);
  const timezone = getTimezoneFromConfig(agent.current_config);
  const language = rawLanguage ? formatLanguageLabel(rawLanguage) : null;

  return (
    <Link href={targetHref} className="block group">
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-xl border border-border/70 bg-card p-4 hover:border-primary/40 hover:bg-secondary/30 transition-all shadow-xs ${
          className ?? ""
        }`}
      >
        <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
          <div className="size-10 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
            <HugeiconsIcon icon={Robot01Icon} className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[260px] sm:max-w-[320px]">
                {agent.name}
              </h3>
            </div>
            {description ? (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{description}</p>
            ) : null}
            {(language || timezone) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {language ? (
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon icon={LanguageCircleIcon} className="size-3.5 text-muted-foreground/70" />
                    <span>{language}</span>
                  </span>
                ) : null}
                {timezone ? (
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon icon={TimeZoneIcon} className="size-3.5 text-muted-foreground/70" />
                    <span>{timezone}</span>
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t border-border/40 sm:border-t-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {showCurrent && currentVersion !== null ? (
              <VersionBadge label="current" version={currentVersion} tone="neutral" />
            ) : null}
            {showActive && activeVersion !== null ? (
              <VersionBadge label="active" version={activeVersion} tone="accent" />
            ) : null}
          </div>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all"
          />
        </div>
      </div>
    </Link>
  );
}
