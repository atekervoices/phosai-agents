import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon?: IconSvgElement;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, description, action, className }: PageHeaderProps) {
  const hasDescription = Boolean(description);

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-3.5 min-w-0">
        {icon ? (
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <HugeiconsIcon icon={icon} className="size-5" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h1
            className={cn(
              "font-bold tracking-tight text-foreground",
              hasDescription ? "text-lg" : "text-xl"
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
