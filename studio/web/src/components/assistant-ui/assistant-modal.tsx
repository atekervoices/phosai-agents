"use client";

import { useState, useRef, useEffect, useCallback, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MessageMultiple01Icon,
  Cancel01Icon,
  SentIcon,
  Robot01Icon,
  Delete02Icon,
  Minimize01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { VoiceOrbVariant } from "./voice-orb";
import {
  ChatPanelMessages,
  ChatPanelUserMessage,
  ChatPanelAssistantMessage,
  ChatPanelTyping,
  ChatPanelComposer,
} from "@/components/elements/chat-panel";

export interface AssistantModalProps extends ComponentProps<"div"> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  agentId?: string;
  variant?: VoiceOrbVariant;
  position?: "bottom-right" | "bottom-left";
  onSendMessage?: (text: string) => Promise<void> | void;
  messages?: Array<{ id: string; role: "user" | "assistant"; text: string; timestamp?: number }>;
  isLoading?: boolean;
  onClearHistory?: () => void;
}

const BUTTON_VARIANTS: Record<string, string> = {
  default: "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25",
  amber: "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25",
  blue: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25",
  violet: "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/25",
  emerald: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25",
};

export function AssistantModal({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  title = "AI Assistant",
  agentId,
  variant = "default",
  position = "bottom-right",
  onSendMessage,
  messages = [],
  isLoading = false,
  onClearHistory,
  className,
  ...props
}: AssistantModalProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggleOpen = useCallback(() => {
    const nextState = !isOpen;
    if (controlledOpen === undefined) {
      setInternalOpen(nextState);
    }
    onOpenChange?.(nextState);
  }, [isOpen, controlledOpen, onOpenChange]);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    onSendMessage?.(trimmed);
  };

  const isBottomLeft = position === "bottom-left";

  return (
    <div
      data-slot="assistant-modal"
      className={cn(
        "fixed z-50 flex flex-col items-end transition-all duration-300 pointer-events-none",
        isBottomLeft ? "bottom-5 left-5 items-start" : "bottom-5 right-5 items-end",
        className
      )}
      {...props}
    >
      {/* Floating Popover Chat Modal Window */}
      {isOpen && (
        <div
          className={cn(
            "pointer-events-auto mb-3 flex flex-col w-[380px] max-w-[calc(100vw-2.5rem)] h-[540px] max-h-[calc(100vh-6rem)] rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          )}
        >
          {/* Header */}
          <div className="flex h-14 items-center justify-between border-b border-border/60 bg-muted/40 px-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                <HugeiconsIcon icon={Robot01Icon} className="size-4" />
                <span className="absolute bottom-0 right-0 size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-foreground truncate max-w-[180px]">
                  {title}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Powered by PhosAI</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {onClearHistory && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  title="Clear chat history"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={toggleOpen}
                title="Minimize assistant modal"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <HugeiconsIcon icon={Minimize01Icon} className="size-4" />
              </button>
            </div>
          </div>

          {/* Messages Thread Container */}
          <ChatPanelMessages>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center my-auto text-center px-4 text-muted-foreground/70">
                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 text-primary">
                  <HugeiconsIcon icon={Robot01Icon} className="size-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">How can I help you today?</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                  Ask me anything or describe what you need assistance with.
                </p>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <ChatPanelUserMessage key={m.id}>{m.text}</ChatPanelUserMessage>
                ) : (
                  <ChatPanelAssistantMessage key={m.id} agentName={title}>
                    {m.text}
                  </ChatPanelAssistantMessage>
                )
              )
            )}

            {isLoading && <ChatPanelTyping />}
            <div ref={messagesEndRef} />
          </ChatPanelMessages>

          {/* Footer Composer Input */}
          <ChatPanelComposer
            placeholder="Type a message..."
            disabled={isLoading}
            onSend={(text) => {
              if (onSendMessage) {
                onSendMessage(text);
              }
            }}
          />
        </div>
      )}

      {/* Floating Trigger Launcher Bubble */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={isOpen ? "Close Assistant Modal" : "Open Assistant Modal"}
        className={cn(
          "pointer-events-auto relative flex size-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/40",
          BUTTON_VARIANTS[variant] || "bg-primary text-primary-foreground shadow-lg"
        )}
        style={variant.startsWith("#") ? { backgroundColor: variant } : undefined}
      >
        {isOpen ? (
          <HugeiconsIcon icon={Cancel01Icon} className="size-6 transition-transform duration-200 rotate-90" />
        ) : (
          <HugeiconsIcon icon={MessageMultiple01Icon} className="size-6 transition-transform duration-200" />
        )}
      </button>
    </div>
  );
}
