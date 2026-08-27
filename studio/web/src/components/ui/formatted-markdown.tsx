"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Cleans and formats raw agent text by:
 * 1. Stripping leading checkmarks / system artifacts (e.g. "✓ ", "[OK] ", "Agent: ")
 * 2. Converting inline concatenated lists ("consider: 1. **Maize**: ... 2. **Beans**:") into proper newline-separated list items
 * 3. Converting inline bullet points into formatted markdown list items
 * 4. Ensuring clean paragraph spacing and section breaks
 */
export function formatAgentText(text: string): string {
  if (!text) return "";

  // 1. Strip leading system checkmarks or status prefixes
  let cleaned = text
    .replace(/^[✓✔☑]\s*/, "")
    .replace(/^(Agent|Assistant):\s*/i, "");

  // 2. Separate inline numbered list items (e.g. "consider: 1. Maize... 2. Beans:")
  cleaned = cleaned.replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n\n$2");

  // 3. Separate inline bullet list items (e.g. "consider: - Maize - Beans")
  cleaned = cleaned.replace(/([^\n])\s+([•\-\*]\s+)/g, "$1\n\n$2");

  // 4. Ensure proper newline before section headings
  cleaned = cleaned.replace(/([^\n])\s+(#{1,6}\s+)/g, "$1\n\n$2");

  // 5. Separate concluding paragraphs after numbered items
  cleaned = cleaned.replace(/(\b[a-z0-9)]\.)\s+([A-Z][a-z]+\s+.*?\b(?:feel free|let me know|hope this|if you have|ask|when choosing|it's also|also consider)\b)/gi, "$1\n\n$2");

  // 6. Normalize multiple consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

interface FormattedMarkdownProps {
  content: string;
  className?: string;
}

export function FormattedMarkdown({ content, className }: FormattedMarkdownProps) {
  const formattedContent = formatAgentText(content);

  return (
    <div className={cn("prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed space-y-2", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          ol: ({ children }) => <ol className="my-2.5 ml-4 list-decimal space-y-2">{children}</ol>,
          ul: ({ children }) => <ul className="my-2.5 ml-4 list-disc space-y-2">{children}</ul>,
          li: ({ children }) => <li className="leading-relaxed pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-lg bg-muted/80 p-3 font-mono text-[11px] border border-border/60">{children}</pre>
          ),
          h1: ({ children }) => <h1 className="text-sm font-bold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xs font-bold mt-2.5 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold mt-2 mb-1">{children}</h3>,
        }}
      >
        {formattedContent}
      </ReactMarkdown>
    </div>
  );
}
