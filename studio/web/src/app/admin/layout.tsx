"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardCircleIcon,
  ChartHistogramIcon,
  VoiceIcon,
  ArrowLeft01Icon,
  UserGroupIcon,
  SmartPhoneIcon,
  Robot01Icon,
  ConnectIcon,
  Logout01Icon,
  PanelLeftIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { UserButton, useUser, useClerk } from "@clerk/nextjs";
import { FerosLogoWordmark } from "@/components/logo";

interface NavItem {
  href: string;
  label: string;
  icon: any;
  exact?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const adminNavSections: NavSection[] = [
  {
    title: "System Oversight",
    items: [
      { href: "/admin", label: "Overview", icon: DashboardCircleIcon, exact: true },
      { href: "/admin/users", label: "User Directory", icon: UserGroupIcon, exact: false },
      { href: "/admin/analytics", label: "Analytics", icon: ChartHistogramIcon, exact: false },
    ],
  },
  {
    title: "Workspace & Telephony",
    items: [
      { href: "/admin/agents", label: "Voice Agents", icon: Robot01Icon, exact: false },
      { href: "/admin/calls", label: "Call Logs", icon: VoiceIcon, exact: false },
      { href: "/admin/telephony", label: "Phone Numbers", icon: SmartPhoneIcon, exact: false },
      { href: "/admin/providers", label: "Integrations", icon: ConnectIcon, exact: false },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const clerk = useClerk();
  const isClerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const { user, isLoaded } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-close mobile drawer when navigating
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const userEmail = user?.primaryEmailAddress?.emailAddress || "";
  const adminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || "simonallanachuka@gmail.com").toLowerCase();
  const isAdmin = !isClerkEnabled || (user as any)?.publicMetadata?.role === "admin" || (Boolean(userEmail) && userEmail.toLowerCase() === adminEmail);

  useEffect(() => {
    if (isLoaded && isClerkEnabled && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isClerkEnabled, isAdmin, router]);

  if (isClerkEnabled && isLoaded && !isAdmin) {
    return null;
  }

  const renderNavContent = () => (
    <>
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <Link href="/admin" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
          <FerosLogoWordmark className="h-7" />
        </Link>
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-primary/10 text-primary border border-primary/20">
          ADMIN
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-1 space-y-5 overflow-y-auto">
        {adminNavSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-1">
            <div className="px-3 text-[10px] font-mono font-semibold uppercase tracking-wider text-sidebar-muted-foreground/70">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-muted hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <HugeiconsIcon
                      icon={item.icon}
                      className={`size-4 shrink-0 ${isActive ? "text-primary" : "text-sidebar-muted-foreground"}`}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border space-y-2 mt-auto">
        {isClerkEnabled && (
          <div className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-sidebar-muted/60 border border-sidebar-border/40">
            <div
              onClick={() => {
                if (clerk?.openUserProfile) clerk.openUserProfile();
              }}
              className="flex items-center gap-2 min-w-0 cursor-pointer group flex-1"
              title="Manage Admin Profile"
            >
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "size-7 border border-border/80 shadow-xs shrink-0",
                  },
                }}
              />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-sidebar-foreground group-hover:text-primary transition-colors truncate max-w-[95px]">
                  {user?.fullName || user?.firstName || userEmail.split("@")[0] || "Admin"}
                </span>
                <span className="text-[10px] text-sidebar-muted-foreground font-mono truncate max-w-[95px]">
                  {userEmail || "System Admin"}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                try {
                  if (clerk?.signOut) clerk.signOut({ redirectUrl: "/sign-in" });
                } catch {
                  /* ignore */
                }
                window.location.href = "/sign-in";
              }}
              title="Sign Out"
              className="p-1.5 rounded-lg text-sidebar-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            >
              <HugeiconsIcon icon={Logout01Icon} className="size-4" />
            </button>
          </div>
        )}
        <Link
          href="/dashboard"
          onClick={() => setMobileMenuOpen(false)}
          className="flex items-center justify-between w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-muted rounded-lg transition-colors group"
        >
          <span className="flex items-center gap-2 font-medium">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5 group-hover:-translate-x-0.5 transition-transform" />
            User Dashboard
          </span>
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background text-foreground">
      {/* Desktop Sidebar */}
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
          <Link href="/admin">
            <FerosLogoWordmark className="h-6" />
          </Link>
        </div>

        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/30">
          ADMIN
        </span>
      </header>

      {/* Mobile Drawer Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
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
