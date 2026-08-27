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
} from "@hugeicons/core-free-icons";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { UserButton, useUser, useClerk, SignOutButton } from "@clerk/nextjs";
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
  const router = useRouter();
  const clerk = useClerk();

  const [mounted, setMounted] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    setIsSigningOut(true);
    try {
      if (isClerkEnabled && clerk?.signOut) {
        clerk.signOut({ redirectUrl: "/sign-in" });
      }
    } catch {
      /* ignore */
    }
    window.location.href = "/sign-in";
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-sidebar border-r border-sidebar-border">
        {/* Brand */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <Link href={`/dashboard/${workspaceSlug}`} className="flex items-center gap-2.5">
            <FerosLogoWordmark className="h-7" />
          </Link>
          {isAdmin && (
            <Link href="/admin" title="Open Admin Console">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all flex items-center gap-1 cursor-pointer">
                <HugeiconsIcon icon={Shield01Icon} className="size-3" />
                ADMIN
              </span>
            </Link>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-1">
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
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-muted hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    className={`size-4 ${isActive ? "text-primary" : "text-sidebar-muted-foreground"}`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Profile & Logout Footer */}
        <div className="p-3 border-t border-sidebar-border">
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
      </aside>

      {/* Main */}
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        {/* Content */}
        <main className="flex-1 px-10 py-10 max-w-[1100px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
