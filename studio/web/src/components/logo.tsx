import * as React from "react";

import { cn } from "@/lib/utils";

type FerosLogoProps = React.ComponentProps<"img">;

export function FerosLogo({ className, ...props }: FerosLogoProps) {
  return (
    <img
      src="/phosai_logo.png"
      alt="PhosAI"
      className={cn("object-contain", className)}
      {...props}
    />
  );
}

export function FerosLogoWordmark({ className, ...props }: FerosLogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none font-sans", className)}>
      <img
        src="/phosai_logo.png"
        alt="PhosAI"
        className="h-8 w-8 aspect-square object-contain shrink-0"
        {...props}
      />
      <span className="font-semibold tracking-tight text-foreground text-lg flex items-center">
        <span>Phos</span>
        <span className="text-primary font-semibold">AI</span>
      </span>
    </div>
  );
}