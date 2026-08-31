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
import { useParams, usePathname } from "next/navigation";
import { UserButton, useUser, useClerk } from "@clerk/nextjs";
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
  const params = useParams();
  const workspaceSlug = (params?.workspace_slug as string) || "default";
  const { user } = useUser();
  const clerk = useClerk();

  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-close mobile drawer when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isClerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const userEmail = user?.primaryEmailAddress?.emailAddress || "";
  const adminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "simonallanachuka@gmail.com").toLowerCase();
  const isAdmin = !isClerkEnabled || (user as any)?.publicMetadata?.role === "admin" || (Boolean(userEmail) && userEmail.toLowerCase() === adminEmail);

  const getNavHref = (path: string) => {
    if (path.startsWith("/admin")) return path;
    return workspaceSlug ? `/dashboard/${workspaceSlug}${path}` : `/dashboard${path}`;
  };

  const handleOpenAccount = () => {
    if (isClerkEnabled && clerk?.openUserProfile) {
      clerk.openUserProfile();
    }
  };

  const handleSignOut = () => {
    try {
      if (isClerkEnabled && clerk?.signOut) {
        clerk.signOut({ redirectUrl: "/sign-in" });
      }
    } catch {
      /* ignore */
    }
    window.location.href = "/sign-in";
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
        <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-sidebar-muted/60 border border-sidebar-border/40 hover:bg-sidebar-muted transition-colors">
          <div
            onClick={handleOpenAccount}
            className="flex items-center gap-2 min-w-0 cursor-pointer group flex-1"
            title="Click to Manage Account"
          >
            {mounted && isClerkEnabled ? (
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "size-7 border border-border/80 shadow-xs shrink-0",
                  },
                }}
              />
            ) : (
              <div className="size-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-extrabold text-xs shrink-0 group-hover:ring-2 group-hover:ring-primary/40 transition-all">
                {userEmail ? userEmail[0].toUpperCase() : "P"}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-sidebar-foreground group-hover:text-primary transition-colors truncate max-w-[95px]">
                {mounted && (user?.fullName || user?.firstName)
                  ? user.fullName || user.firstName
                  : userEmail
                  ? userEmail.split("@")[0]
                  : "PhosAI User"}
              </span>
              <span className="text-[10px] text-sidebar-muted-foreground font-mono truncate max-w-[95px]">
                {userEmail || "Local Admin"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSignOut();
            }}
            title="Sign Out"
            className="p-1.5 rounded-lg text-sidebar-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          >
            <HugeiconsIcon icon={Logout01Icon} className="size-4" />
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
          {mounted && isClerkEnabled ? (
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "size-7 border border-border/80 shadow-xs shrink-0",
                },
              }}
            />
          ) : null}
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
