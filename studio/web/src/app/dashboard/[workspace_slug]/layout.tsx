"use client";

import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Robot01Icon,
  CallInternal02Icon,
  DashboardCircleIcon,
  ConnectIcon,
  Settings01Icon,
  VoiceIcon,
  Shield01Icon,
  Logout01Icon,
  PanelLeftIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { FerosLogoWordmark } from "@/components/logo";

const navItems = [
  { href: "/dashboard", label: "Home", icon: DashboardCircleIcon },
  { href: "/dashboard/agents", label: "Agents", icon: Robot01Icon },
  { href: "/dashboard/calls", label: "Calls", icon: VoiceIcon },
  {
    href: "/dashboard/phone-numbers",
    label: "Phone Numbers",
    icon: CallInternal02Icon,
  },
  { href: "/dashboard/integrations", label: "Integrations", icon: ConnectIcon },
  { href: "/dashboard/settings", label: "Settings", icon: Settings01Icon },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = (params?.workspace_slug as string) || "default";
  const { user, isAdmin, signOut, loading } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Strict route protection: either you have an account and are signed in, or redirect to sign-in
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/sign-in");
    }
  }, [user, loading, router]);

  // Auto-close mobile drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      console.error("Sign-out error:", err);
    } finally {
      window.location.href = "/sign-in";
    }
  };

  // Prevent flashing unauthenticated content while checking auth
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground font-mono">Loading workspace...</span>
        </div>
      </div>
    );
  }

  const userEmail = user.email || "";
  const displayName = user.displayName || (userEmail ? userEmail.split("@")[0] : "Account");
  const avatarLetter = (displayName[0] || userEmail[0] || "U").toUpperCase();

  const getNavHref = (path: string) => {
    if (path.startsWith("/admin")) return path;
    return workspaceSlug ? `/dashboard/${workspaceSlug}${path}` : `/dashboard${path}`;
  };

  const renderNavContent = () => (
    <>
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <Link href={`/dashboard/${workspaceSlug}`} className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
          <FerosLogoWordmark className="h-7" />
        </Link>
        {isAdmin && (
          <Link href="/admin" title="Open Admin Console" onClick={() => setMobileMenuOpen(false)}>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all flex items-center gap-1 cursor-pointer">
              <HugeiconsIcon icon={Shield01Icon} className="size-3" />
              ADMIN
            </span>
          </Link>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-1 overflow-y-auto">
        <div className="space-y-0.5">
          {[
            ...navItems,
            ...(isAdmin ? [{ href: "/admin", label: "Admin Console", icon: Shield01Icon }] : []),
          ].map((item) => {
            const href = getNavHref(item.href === "/dashboard" ? "" : item.href.replace("/dashboard", ""));
            const isActive =
              pathname === href ||
              (href !== `/dashboard/${workspaceSlug}` && href !== "/dashboard" && pathname.startsWith(href));

            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-muted hover:text-sidebar-accent-foreground"
                }`}
              >
                <HugeiconsIcon
                  icon={item.icon}
                  className={`size-4.5 shrink-0 ${isActive ? "text-primary" : "text-sidebar-muted-foreground"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Profile & Logout Footer */}
      <div className="p-3 border-t border-sidebar-border mt-auto">
        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-sidebar-muted/40 border border-sidebar-border/60 hover:bg-sidebar-muted/80 transition-all">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="size-8 rounded-full border border-border/80 shadow-xs shrink-0 object-cover"
              />
            ) : (
              <div className="size-8 rounded-full bg-primary/15 text-primary border border-primary/25 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {avatarLetter}
              </div>
            )}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold text-sidebar-foreground truncate" title={displayName}>
                {displayName}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono truncate" title={userEmail}>
                {userEmail}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSignOut();
            }}
            disabled={isSigningOut}
            title="Log Out"
            aria-label="Log Out"
            className="size-8 flex items-center justify-center rounded-lg text-sidebar-muted-foreground hover:text-destructive hover:bg-destructive/15 active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isSigningOut ? (
              <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <HugeiconsIcon icon={Logout01Icon} className="size-4" />
            )}
          </button>
        </div>
      </div>

    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background text-foreground">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col bg-sidebar border-r border-sidebar-border">
        {renderNavContent()}
      </aside>

      {/* Mobile Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex md:hidden h-14 w-full items-center justify-between border-b border-border/70 bg-background/95 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-secondary/60 text-foreground hover:bg-secondary transition-colors"
            aria-label="Open Navigation Menu"
          >
            <HugeiconsIcon icon={PanelLeftIcon} className="size-5" />
          </button>
          <Link href={`/dashboard/${workspaceSlug}`}>
            <FerosLogoWordmark className="h-6" />
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link href="/admin">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/30 flex items-center gap-1">
                <HugeiconsIcon icon={Shield01Icon} className="size-3" />
                ADMIN
              </span>
            </Link>
          )}
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={displayName}
              className="size-7 rounded-full border border-border/80 shadow-xs shrink-0 object-cover"
            />
          ) : (
            <div className="size-7 rounded-full bg-primary/15 text-primary border border-primary/25 flex items-center justify-center font-bold text-xs shrink-0">
              {avatarLetter}
            </div>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            title="Log Out"
            aria-label="Log Out"
            className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isSigningOut ? (
              <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <HugeiconsIcon icon={Logout01Icon} className="size-4" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Sliding Panel */}
          <aside className="relative flex w-[280px] max-w-[85vw] flex-col bg-sidebar border-r border-sidebar-border shadow-2xl h-full z-10 animate-in slide-in-from-left duration-200">
            <div className="absolute top-4 right-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="size-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-muted transition-colors"
                aria-label="Close menu"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
              </button>
            </div>
            {renderNavContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen min-w-0">
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10 max-w-[1150px] w-full mx-auto min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
