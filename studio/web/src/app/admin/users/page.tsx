"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserGroupIcon,
  ShieldKeyIcon,
  Search01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";

interface UserItem {
  id: string;
  email: string;
  name?: string;
  image_url?: string;
  role: string;
  agents_count: number;
  call_minutes: number;
  status: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api-proxy/admin/users");
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch (err) {
        console.error("Failed to fetch users:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(search.toLowerCase())) ||
      u.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          icon={UserGroupIcon}
          title="User & Tenant Directory"
          description="Manage registered user accounts, agent quotas, and multi-tenant access across PhosAI Voice OS."
        />
        <div className="flex items-center gap-2 bg-card border border-border px-3.5 py-1.5 rounded-lg text-xs font-mono text-muted-foreground">
          <HugeiconsIcon icon={UserGroupIcon} className="size-4 text-primary" />
          <span>Total Registered Accounts: <strong className="text-foreground font-bold">{users.length}</strong></span>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-sm">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        />
        <input
          type="text"
          placeholder="Search by User Name, Email, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Users Table */}
      <div className="rounded-lg bg-card border border-border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs text-muted-foreground uppercase font-mono">
            <tr>
              <th className="px-5 py-3 font-medium">User Account</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Active Agents</th>
              <th className="px-5 py-3 font-medium">Est. Call Minutes</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Joined / Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  Loading user accounts from Clerk Directory...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  No matching user accounts found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => {
                const isAdmin = u.role === "Super Admin";

                return (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {u.image_url ? (
                          <img src={u.image_url} alt={u.email} className="size-8 rounded-full border border-border" />
                        ) : (
                          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs font-mono">
                            {(u.name || u.email).substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-foreground">{u.name || u.email}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium font-mono ${
                          isAdmin
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-muted text-muted-foreground border border-border"
                        }`}
                      >
                        {isAdmin && <HugeiconsIcon icon={ShieldKeyIcon} className="size-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono font-medium text-foreground">
                      {u.agents_count} agents
                    </td>
                    <td className="px-5 py-4 font-mono text-muted-foreground">
                      {u.call_minutes} mins
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.status === "ACTIVE" 
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                      }`}>
                        <HugeiconsIcon icon={u.status === "ACTIVE" ? CheckmarkCircle02Icon : AlertCircleIcon} className="size-3" />
                        {u.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <HugeiconsIcon icon={Clock01Icon} className="size-3 text-muted-foreground" />
                        {new Date(u.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
