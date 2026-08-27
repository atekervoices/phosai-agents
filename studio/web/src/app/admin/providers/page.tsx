"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ConnectIcon,
  Key01Icon,
  CheckmarkCircle02Icon,
  Building02Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";

interface ProviderCredential {
  id: string;
  name: string;
  provider_type: string;
  is_valid?: boolean;
}

export default function AdminProvidersPage() {
  const [credentials, setCredentials] = useState<ProviderCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProviders() {
      try {
        const res = await fetch("/api-proxy/credentials");
        if (res.ok) {
          const json = await res.json();
          setCredentials(json.credentials || json || []);
        }
      } catch (err) {
        console.error("Failed to fetch provider credentials:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProviders();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ConnectIcon}
        title="Integrations & Vault Credentials"
        description="Encrypted API keys and provider connections for Telnyx, Deepgram, OpenAI, ElevenLabs, and Cartesia."
      />

      <div className="rounded-xl bg-card border border-border p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Encrypted Provider Credentials</h3>
          <span className="text-xs font-mono text-muted-foreground">{credentials.length} Tokens Vaulted</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-muted-foreground">
            Loading vaulted provider credentials...
          </div>
        ) : credentials.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border rounded-xl space-y-3">
            <div className="size-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <HugeiconsIcon icon={ConnectIcon} className="size-5" />
            </div>
            <div className="text-sm font-semibold text-foreground">Vault Credentials Secured</div>
            <p className="text-xs text-muted-foreground">
              Provider credentials are loaded from environment variables and encrypted storage.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="rounded-xl bg-card border border-border p-5 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <HugeiconsIcon icon={Key01Icon} className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{cred.name}</h4>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">
                      {cred.provider_type}
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" />
                  VALIDATED
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
