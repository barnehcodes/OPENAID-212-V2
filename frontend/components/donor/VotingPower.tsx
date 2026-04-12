"use client";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Vote, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface VotingPowerProps {
  contribution: number;
  baseCap: number;
  role: string;
}

const thresholds = [
  { role: "Donor", multiplier: "1x", description: "Base donation cap" },
  { role: "NGO", multiplier: "10x", description: "10x base donation cap" },
  { role: "GO", multiplier: "15x", description: "15x base donation cap" },
  { role: "Beneficiary", multiplier: "N/A", description: "Crisis-verified (no cap)" },
];

export function VotingPower({ contribution, baseCap, role }: VotingPowerProps) {
  const multiplier = role === "NGO" ? 10 : role === "GO" ? 15 : 1;
  const threshold = baseCap * multiplier;
  const progress = threshold > 0 ? Math.min(100, (contribution / threshold) * 100) : 0;
  const eligible = contribution >= threshold && threshold > 0;

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="voting">
      <div className="flex items-center gap-2 mb-4">
        <Vote className="w-5 h-5 text-openaid-deep-blue" />
        <h3 className="font-semibold text-openaid-black">Voting Power</h3>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-openaid-dim-text">Your progress</span>
          <span className={`text-sm font-semibold ${eligible ? "text-status-green" : "text-status-amber"}`}>
            {eligible ? "Eligible" : `${progress.toFixed(0)}%`}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-openaid-mid-gray mt-1">
          {contribution} / {threshold} AID ({multiplier}x threshold for {role})
        </p>
      </div>

      <div className="border-t border-openaid-border pt-4">
        <div className="flex items-center gap-1 mb-3">
          <span className="text-xs font-semibold text-openaid-mid-gray uppercase tracking-wider">
            Role Thresholds
          </span>
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-3 h-3 text-openaid-mid-gray" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Minimum donation to earn governance voting rights</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-2">
          {thresholds.map((t) => (
            <div key={t.role} className="flex items-center justify-between text-xs">
              <span className={`${t.role === role ? "font-semibold text-openaid-black" : "text-openaid-dim-text"}`}>
                {t.role}
              </span>
              <span className="text-openaid-mid-gray">{t.multiplier} - {t.description}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
