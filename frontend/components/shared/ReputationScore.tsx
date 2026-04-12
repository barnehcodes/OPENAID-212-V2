"use client";

import { Card } from "@/components/ui/card";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { Shield, TrendingUp } from "lucide-react";

interface ReputationScoreProps {
  role: "GO" | "NGO";
}

export function ReputationScore({ role }: ReputationScoreProps) {
  const { address } = useAccount();

  const { data: rep } = useScaffoldContractRead({
    contractName: "ReputationEngine",
    functionName: "getReputation",
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  const value = rep ? Number(rep) : 0;
  const normalized = Math.min(100, Math.round(value / 100));

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-openaid-deep-blue" />
        <h3 className="font-semibold text-openaid-black">Reputation Score</h3>
      </div>

      <div className="flex items-center gap-8">
        <RadialGauge
          value={normalized}
          label={role}
          size={100}
          strokeWidth={7}
          color="auto"
        />

        <div className="flex-1 space-y-3">
          <div>
            <p className="text-2xl font-bold text-openaid-black">{value.toLocaleString()}</p>
            <p className="text-xs text-openaid-mid-gray">Validator score</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-status-green">
            <TrendingUp className="w-3.5 h-3.5" />
            Updated each epoch based on participation and behavior
          </div>
        </div>
      </div>
    </Card>
  );
}
