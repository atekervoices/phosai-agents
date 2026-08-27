"use client";

import type { ComponentProps, KeyboardEvent } from "react";
import { useState, useRef, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUp01Icon,
  Robot01Icon,
  UserIcon,
  AlertCircleIcon,
  Cancel01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { field, inkButton, paper } from "./surfaces";

export function ChatPanel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="chat-panel"
      className={cn(
        paper,
        "flex h-full w-full flex-col overflow-hidden rounded-2xl bg-background/95 backdrop-blur-md",
        className
      )}
      {...props}
    />
  );
}

export function ChatPanelMessages({ className, ...props }: ComponentProps<"div">) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [props.children]);

  return (
    <div
      data-slot="chat-panel-messages"
      className={cn(
        "flex flex-1 flex-col justify-start gap-3 overflow-y-auto p-4 custom-scrollbar",
        className
      )}
      {...props}
    >
      {props.children}
      <div ref={bottomRef} />
    </div>
  );
}

export function ChatPanelUserMessage({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="chat-panel-user-message"
      className="flex flex-col items-end gap-1 self-end max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 pr-1">
        You
      </span>
      <div
        className={cn(
          "rounded-2xl rounded-tr-xs bg-primary text-primary-foreground px-4 py-2.5 text-xs font-medium leading-relaxed shadow-sm",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

import { FormattedMarkdown } from "@/components/ui/formatted-markdown";

export function ChatPanelAssistantMessage({
  className,
  children,
  agentName = "Assistant",
  ...props
}: ComponentProps<"div"> & { agentName?: string }) {
  return (
    <div
      data-slot="chat-panel-assistant-message"
      className="flex flex-col items-start gap-1 self-start max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <span className="text-[10px] font-mono uppercase tracking-wider text-primary/80 flex items-center gap-1 pl-1">
        <HugeiconsIcon icon={Robot01Icon} className="size-3" />
        {agentName}
      </span>
      <div
        className={cn(
          "rounded-2xl rounded-tl-xs bg-secondary/80 text-foreground border border-border/60 px-4 py-2.5 text-xs leading-relaxed shadow-2xs",
          className
        )}
        {...props}
      >
        {typeof children === "string" ? (
          <FormattedMarkdown content={children} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function ChatPanelErrorMessage({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="chat-panel-error-message"
      className="flex flex-col items-center gap-1 self-center w-full max-w-[95%] animate-in fade-in slide-in-from-bottom-1 duration-200"
    >
      <div
        className={cn(
          "flex items-center gap-2 w-full rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-3.5 py-2 text-xs font-medium leading-tight",
          className
        )}
        {...props}
      >
        <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0" />
        <span className="flex-1">{children}</span>
      </div>
    </div>
  );
}

export function ChatPanelTyping({
  className,
  ...props
}: Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      data-slot="chat-panel-typing"
      className={cn(
        "fade-in animate-in flex items-center gap-1.5 self-start px-3 py-2.5 rounded-2xl rounded-tl-xs bg-secondary/60 border border-border/40 duration-300",
        className
      )}
      {...props}
    >
      {["-0.32s", "-0.16s", "0s"].map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="bg-primary/70 size-1.5 animate-bounce rounded-full motion-reduce:animate-none"
          style={{ animationDelay: delay, animationDuration: "1.1s" }}
        />
      ))}
    </div>
  );
}

export function ChatPanelComposer({
  placeholder = "Type a message...",
  value: externalValue,
  onChange: externalOnChange,
  onSend,
  onCancel,
  disabled = false,
  loading = false,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children" | "placeholder" | "onChange"> & {
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
  onSend?: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [internalValue, setInternalValue] = useState("");
  const value = externalValue !== undefined ? externalValue : internalValue;

  const handleChange = (val: string) => {
    if (externalOnChange) {
      externalOnChange(val);
    } else {
      setInternalValue(val);
    }
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || !onSend || disabled || loading) return;
    onSend(trimmed);
    if (externalValue === undefined) {
      setInternalValue("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      data-slot="chat-panel-composer"
      className={cn(
        "mx-auto flex h-12 w-full max-w-2xl shrink-0 items-center gap-2 rounded-full py-1.5 ps-5 pe-2.5 border border-border/80 bg-card/95 backdrop-blur-xl shadow-lg focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all",
        className
      )}
      {...props}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || loading}
        className="flex-1 bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
      />
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          aria-label="Send"
          onClick={handleSend}
          disabled={!value.trim() || disabled || loading || !onSend}
          className={cn(
            "flex h-9 min-w-9 items-center justify-center rounded-[14px] bg-primary text-primary-foreground font-bold px-2.5 shadow-md shadow-primary/20 transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-30",
          )}
        >
          <svg className="size-4 fill-current stroke-current" viewBox="0 0 24 24">
            <path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7z" />
          </svg>
        </button>

        {onCancel && (
          <>
            <div className="w-px h-5 bg-border/60 mx-1" />
            <button
              type="button"
              aria-label="Cancel session"
              onClick={onCancel}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="End session"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
