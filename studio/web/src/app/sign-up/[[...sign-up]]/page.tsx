"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateProfile } from "firebase/auth";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  LockPasswordIcon,
  Mail01Icon,
  UserIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { useAuth } from "@/contexts/auth-context";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, signInWithGoogle, isFirebaseConfigured } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      if (isFirebaseConfigured) {
        const cred = await signUp(email, password);
        if (name.trim() && cred.user) {
          try {
            await updateProfile(cred.user, { displayName: name.trim() });
          } catch {
            /* ignore profile update error */
          }
        }
      } else {
        localStorage.setItem("demo_user_email", email || "admin@phosai.com");
      }
      window.location.href = "/dashboard";
    } catch (err: any) {
      console.error("Sign-up failed:", err);
      const msg =
        err?.code === "auth/email-already-in-use"
          ? "This email is already registered. Please sign in instead."
          : err?.code === "auth/weak-password"
          ? "Password should be at least 6 characters."
          : err?.message || "Failed to create account. Please try again.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError("");
    setIsLoading(true);

    try {
      if (isFirebaseConfigured) {
        await signInWithGoogle();
      } else {
        localStorage.setItem("demo_user_email", "google.user@phosai.com");
      }
      window.location.href = "/dashboard";
    } catch (err: any) {
      console.error("Google sign-up failed:", err);
      if (err?.code !== "auth/popup-closed-by-user") {
        setError(err?.message || "Google registration failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
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
        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-xs space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Social Sign-Up with Google */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            className="w-full h-10 rounded-xl border border-border bg-secondary/40 text-xs font-semibold text-foreground flex items-center justify-center gap-2.5 hover:bg-secondary hover:text-primary transition-all cursor-pointer disabled:opacity-50"
          >
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/80" />
            </div>
            <span className="relative bg-card px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Or continue with email
            </span>
          </div>

          {/* Registration Form */}
          <form onSubmit={handleEmailSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Full name</label>
              <div className="relative">
                <HugeiconsIcon
                  icon={UserIcon}
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Simon Achuka"
                  className="h-10 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-3 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Email address</label>
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
                  placeholder="At least 6 characters"
                  className="h-10 w-full rounded-xl border border-border/80 bg-secondary/30 pl-9 pr-3 text-xs font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
            >
              <span>{isLoading ? "Creating account..." : "Create Account"}</span>
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            </button>
          </form>

          {/* Sign In Redirect */}
          <div className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-md mx-auto text-center space-y-2 text-[11px] text-muted-foreground pb-4">
        <p>
          By creating an account, you agree to PhosAI&apos;s{" "}
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
