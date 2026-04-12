"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { useScaffoldContractRead, useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { Award, CheckCircle2, Loader2 } from "lucide-react";

interface SamaritanScoreProps {
  crisisId: number;
}

export function SamaritanScore({ crisisId }: SamaritanScoreProps) {
  const { address } = useAccount();

  const { data: score } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "getSamaritanScore",
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  const { data: hasTracked } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "hasDonorTrackedCrisis",
    args: address ? [address, BigInt(crisisId)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  const { writeAsync: trackCrisis, isPending: trackPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "confirmCrisisDonationTracked",
  });

  const scoreVal = score ? Number(score) : 0;
  const tracked = hasTracked as boolean;

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="samaritan">
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-5 h-5 text-status-amber" />
        <h3 className="font-semibold text-openaid-black">Samaritan Score</h3>
      </div>

      <div className="flex items-center gap-8">
        <RadialGauge
          value={Math.min(scoreVal, 100)}
          label="Your Score"
          size={100}
          strokeWidth={7}
          color="auto"
        />

        <div className="flex-1 space-y-3">
          <p className="text-sm text-openaid-dim-text">
            Track your donations to crises to earn Samaritan points. Higher scores demonstrate your commitment to humanitarian aid.
          </p>

          {tracked ? (
            <div className="flex items-center gap-2 text-sm text-status-green">
              <CheckCircle2 className="w-4 h-4" />
              Crisis #{crisisId} tracked
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => trackCrisis([BigInt(crisisId)])}
              disabled={trackPending}
            >
              {trackPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Award className="w-3 h-3" />}
              Track Crisis #{crisisId}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
