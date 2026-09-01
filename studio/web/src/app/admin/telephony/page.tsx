"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SmartPhoneIcon,
  Add01Icon,
  CallInternal02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { PageHeader } from "@/components/ui/page-header";

interface PhoneRecord {
  id: string;
  phone_number: string;
  provider: string;
  assigned_agent_id?: string;
  status?: string;
}

export default function AdminTelephonyPage() {
  const [numbers, setNumbers] = useState<PhoneRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTelephony() {
      try {
        const res = await fetch("/api-proxy/telephony/phone-numbers");
        if (res.ok) {
          const json = await res.json();
          setNumbers(json.phone_numbers || json || []);
        }
      } catch (err) {
        console.error("Failed to fetch telephony numbers:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTelephony();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          icon={SmartPhoneIcon}
          title="Telephony & SIP Trunks"
          description="Inbound & outbound phone numbers connected via Telnyx and Twilio SIP gateways."
        />
      </div>

      <div className="rounded-xl bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">Provisioned Phone Numbers</h3>
          <span className="text-xs font-mono text-muted-foreground">{numbers.length} Numbers Active</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-muted-foreground">
            Loading telephony numbers...
          </div>
        ) : numbers.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-border rounded-xl space-y-3">
            <div className="size-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <HugeiconsIcon icon={SmartPhoneIcon} className="size-5" />
            </div>
            <div className="text-sm font-semibold text-foreground">No Phone Numbers Provisioned</div>
            <p className="text-xs text-muted-foreground">
              No SIP or PSTN phone numbers have been imported yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {numbers.map((num) => (
              <div
                key={num.id}
                className="rounded-xl bg-card border border-border p-5 space-y-3 hover:border-primary/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <HugeiconsIcon icon={SmartPhoneIcon} className="size-4" />
                    </div>
                    <div>
                      <div className="font-mono font-semibold text-sm text-foreground">
                        {num.phone_number}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        {num.provider || "Telnyx SIP"}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    ACTIVE
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
