"use client";

import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { CrisisSelector } from "./CrisisSelector";
import { type Phase } from "@/hooks/useCrisis";

interface TopBarProps {
  title: string;
  subtitle?: string;
  phase?: Phase;
  crisisId: number;
  crisisCount: number;
  onCrisisChange: (id: number) => void;
}

export function TopBar({
  title,
  subtitle,
  phase,
  crisisId,
  crisisCount,
  onCrisisChange,
}: TopBarProps) {
  return (
    <div className="flex items-center justify-between px-8 py-4 border-b border-openaid-border bg-openaid-cream/80 backdrop-blur-sm">
      <div>
        <h1 className="text-xl font-semibold text-openaid-black">{title}</h1>
        {subtitle && (
          <p className="text-sm text-openaid-dim-text mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <CrisisSelector
          crisisId={crisisId}
          crisisCount={crisisCount}
          onChange={onCrisisChange}
        />
        {phase && <PhaseBadge phase={phase} />}
      </div>
    </div>
  );
}
