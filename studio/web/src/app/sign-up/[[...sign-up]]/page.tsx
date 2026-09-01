"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  LockPasswordIcon,
  Mail01Icon,
  SparklesIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";

export default function SignUpPage() {
  const router = useRouter();
  const isClerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      router.push("/dashboard");
    }, 600);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center bg-background px-4 py-8 select-none">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[500px] bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Header / Brand Logo */}
      <div className="w-full max-w-md mx-auto text-center space-y-3 pt-6 sm:pt-10">
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          <div className="size-12 rounded-2xl bg-card border border-border/80 p-2 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
            <Image
              src="/phosai_logo.png"
              alt="PhosAI Logo"
              width={36}
              height={36}
              className="object-contain"
              priority
            />
          </div>
        </Link>
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Create your PhosAI Studio account
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Enterprise Voice Agent Platform & Real-Time Telephony Gateway
          </p>
        </div>
      </div>

      {/* Main Authentication Card */}
      <div className="w-full max-w-md mx-auto my-6">
        {isClerkEnabled ? (
          <SignUp
            appearance={{
              layout: {
                socialButtonsPlacement: "top",
                logoPlacement: "none",
              },
              variables: {
                colorPrimary: "#EAB308",
                colorText: "var(--foreground)",
                colorBackground: "var(--card)",
                colorInputBackground: "var(--accent)",
                colorInputText: "var(--foreground)",
                borderRadius: "0.75rem",
              },
              elements: {
                rootBox: "w-full mx-auto",
                card: "w-full rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton:
                  "h-10 rounded-xl border border-border bg-secondary/50 text-xs font-semibold text-foreground hover:bg-secondary transition-colors",
                formButtonPrimary:
                  "h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 transition-all",
                formFieldInput:
                  "h-10 rounded-xl border border-border/80 bg-secondary/30 px-3 text-xs font-medium text-foreground focus:ring-1 focus:ring-primary/40 transition-all",
                footerActionLink: "text-primary font-semibold hover:underline",
              },
            }}
          />
        ) : (
          <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs space-y-6">
            <form onSubmit={handleDemoSignUp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Full Name</label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={UserIcon}
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your Name"
                    className="h-10 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-3 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Work Email</label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={Mail01Icon}
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-10 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-3 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Password</label>
                <div className="relative">
                  <HugeiconsIcon
                    icon={LockPasswordIcon}
                    className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-3 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
              >
                <span>{isLoading ? "Creating account..." : "Get Started"}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </button>
            </form>

            <div className="text-center">
              <Link href="/sign-in" className="text-xs text-muted-foreground hover:text-foreground">
                Already have an account? <span className="text-primary font-semibold">Sign in</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="w-full max-w-md mx-auto text-center space-y-2 text-[11px] text-muted-foreground pb-4">
        <p>
          By signing up, you agree to PhosAI&apos;s{" "}
          <a href="#" className="underline hover:text-foreground">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="underline hover:text-foreground">
            Privacy Policy
          </a>
          .
        </p>
        <p className="font-mono text-[10px]">© 2026 PhosAI Inc. All rights reserved.</p>
      </div>
    </div>
  );
}
