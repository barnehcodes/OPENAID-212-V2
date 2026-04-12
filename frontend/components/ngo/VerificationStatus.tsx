"use client";

import { useParticipant } from "@/hooks/useParticipant";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export function VerificationStatus() {
  const { participant } = useParticipant();
  const verified = participant?.isVerified ?? false;

  return (
    <div
      className={`rounded-xl p-4 flex items-center gap-3 ${
        verified
          ? "bg-status-green/10 border border-status-green/30"
          : "bg-status-amber/10 border border-status-amber/30"
      }`}
    >
      {verified ? (
        <ShieldCheck className="w-5 h-5 text-status-green flex-shrink-0" />
      ) : (
        <ShieldAlert className="w-5 h-5 text-status-amber flex-shrink-0" />
      )}
      <div>
        <p className={`text-sm font-semibold ${verified ? "text-status-green" : "text-status-amber"}`}>
          {verified ? "NGO Verified" : "Verification Pending"}
        </p>
        <p className="text-xs text-openaid-dim-text">
          {verified
            ? "You are verified and can run for coordinator"
            : "Awaiting verification from the verification multisig"}
        </p>
      </div>
    </div>
  );
}
