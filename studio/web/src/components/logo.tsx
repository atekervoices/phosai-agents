import * as React from "react";
import { cn } from "@/lib/utils";

type LogoProps = React.ComponentProps<"div">;

export function FerosLogo({ className, ...props }: LogoProps) {
  return (
    <div className={cn("inline-flex shrink-0 items-center justify-center", className)} {...props}>
      <img
        src="/phosai_logo.png"
        alt="PhosAI"
        className="h-8 w-8 object-contain shrink-0"
      />
    </div>
  );
}

export function FerosLogoWordmark({ className, ...props }: LogoProps) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none font-sans cursor-pointer", className)} {...props}>
      <img
        src="/phosai_logo.png"
        alt="PhosAI"
        className="h-8 w-8 object-contain shrink-0"
        onError={(e) => {
          (e.target as HTMLElement).style.display = "none";
        }}
      />
      <span className="tracking-tight text-xl flex items-center leading-none">
        <span className="font-bold text-foreground">Phos</span>
        <span className="font-normal text-primary">AI</span>
      </span>
    </div>
  );
}