"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { Coins, Package } from "lucide-react";

interface AidSummaryProps {
  crisisId: number;
}

export function AidSummary({ crisisId }: AidSummaryProps) {
  const { address } = useAccount();

  const { data: ftReceived } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "ftReceived",
    args: address ? [address, BigInt(crisisId)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  const { data: ftConfirmed } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "ftConfirmed",
    args: address ? [address, BigInt(crisisId)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  const ftVal = ftReceived ? formatEther(ftReceived as bigint) : "0";
  const confirmed = ftConfirmed as boolean;

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <h3 className="text-base font-semibold text-openaid-black mb-1">Aid Summary</h3>
      <p className="text-xs text-openaid-mid-gray mb-4" dir="rtl">ملخص المساعدات</p>

      <div className="space-y-4">
        {/* FT Summary */}
        <div className="flex items-center justify-between bg-white/60 rounded-xl border border-openaid-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-status-green/10 flex items-center justify-center">
              <Coins className="w-5 h-5 text-status-green" />
            </div>
            <div>
              <p className="text-sm font-medium text-openaid-black">Money Received</p>
              <p className="text-xs text-openaid-mid-gray">المبلغ المستلم</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-openaid-black">{ftVal} ETH</p>
            <Badge variant="outline" className={confirmed ? "bg-status-green/15 text-status-green border-status-green/30 text-[10px]" : "bg-status-amber/15 text-status-amber border-status-amber/30 text-[10px]"}>
              {confirmed ? "Confirmed" : "Pending Confirmation"}
            </Badge>
          </div>
        </div>

        {/* In-kind placeholder */}
        <div className="flex items-center justify-between bg-white/60 rounded-xl border border-openaid-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-openaid-blue/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-openaid-blue" />
            </div>
            <div>
              <p className="text-sm font-medium text-openaid-black">Items Received</p>
              <p className="text-xs text-openaid-mid-gray">المواد العينية المستلمة</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-openaid-black">—</p>
            <p className="text-[10px] text-openaid-mid-gray">Check assigned items</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
