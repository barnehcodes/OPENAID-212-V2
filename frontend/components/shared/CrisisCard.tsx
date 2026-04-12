import { Card } from "@/components/ui/card";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { Users, Coins } from "lucide-react";

interface CrisisCardProps {
  crisisId: number;
  name: string;
  phase: string;
  escrowTotal: string;
  distributed: string;
  distributionPct: number;
  beneficiaryCount: number;
  coordinator?: string;
}

export function CrisisCard({
  name,
  phase,
  escrowTotal,
  distributed,
  distributionPct,
  beneficiaryCount,
  coordinator,
}: CrisisCardProps) {
  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-openaid-black">{name}</h3>
        <PhaseBadge phase={phase} />
      </div>
      <div className="flex items-center gap-6">
        <RadialGauge value={distributionPct} label="Distributed" size={90} strokeWidth={6} color="auto" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-openaid-mid-gray" />
            <span className="text-sm text-openaid-dim-text">Escrow: <strong className="text-openaid-black">{escrowTotal}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-openaid-mid-gray" />
            <span className="text-sm text-openaid-dim-text">Distributed: <strong className="text-openaid-black">{distributed}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-openaid-mid-gray" />
            <span className="text-sm text-openaid-dim-text">Beneficiaries: <strong className="text-openaid-black">{beneficiaryCount}</strong></span>
          </div>
          {coordinator && (
            <div className="text-xs text-openaid-mid-gray">
              Coordinator: <span className="font-mono">{coordinator.slice(0, 6)}...{coordinator.slice(-4)}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
