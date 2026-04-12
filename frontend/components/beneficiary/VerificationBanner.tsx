"use client";

import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { ShieldCheck, ShieldAlert } from "lucide-react";

interface VerificationBannerProps {
  crisisId: number;
}

export function VerificationBanner({ crisisId }: VerificationBannerProps) {
  const { address } = useAccount();

  const { data: isVerified } = useScaffoldContractRead({
    contractName: "Registry",
    functionName: "isCrisisVerifiedBeneficiary",
    args: address ? [address, BigInt(crisisId)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  const verified = isVerified as boolean;

  return (
    <div
      className={`rounded-xl p-5 flex items-center gap-4 ${
        verified
          ? "bg-status-green/10 border-2 border-status-green/30"
          : "bg-status-amber/10 border-2 border-status-amber/30"
      }`}
    >
      {verified ? (
        <ShieldCheck className="w-8 h-8 text-status-green flex-shrink-0" />
      ) : (
        <ShieldAlert className="w-8 h-8 text-status-amber flex-shrink-0" />
      )}
      <div>
        <h3 className={`text-lg font-semibold ${verified ? "text-status-green" : "text-status-amber"}`}>
          {verified ? "You are verified for this crisis" : "Verification pending"}
        </h3>
        <p className="text-sm text-openaid-dim-text mt-1">
          {verified
            ? "You can receive aid and confirm deliveries for Crisis #" + crisisId
            : "A Government Organization or verification authority must verify you for Crisis #" + crisisId}
        </p>
        {/* Arabic label */}
        <p className="text-xs text-openaid-mid-gray mt-2 font-medium" dir="rtl">
          {verified ? "تم التحقق من هويتك لهذه الأزمة" : "في انتظار التحقق"}
        </p>
      </div>
    </div>
  );
}
