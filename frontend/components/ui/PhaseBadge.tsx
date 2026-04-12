import { Badge } from "@/components/ui/badge";

const phaseConfig: Record<string, { className: string }> = {
  DECLARED: { className: "bg-openaid-blue/15 text-openaid-deep-blue border-openaid-blue/30" },
  VOTING:   { className: "bg-status-amber/15 text-status-amber border-status-amber/30" },
  ACTIVE:   { className: "bg-status-red/15 text-status-red border-status-red/30" },
  REVIEW:   { className: "bg-status-amber/15 text-status-amber border-status-amber/30" },
  PAUSED:   { className: "bg-status-red/15 text-status-red border-status-red/30" },
  CLOSED:   { className: "bg-status-green/15 text-status-green border-status-green/30" },
};

export function PhaseBadge({ phase }: { phase: string }) {
  const config = phaseConfig[phase] ?? phaseConfig.DECLARED;
  return (
    <Badge variant="outline" className={`text-xs font-semibold uppercase tracking-wider ${config.className}`}>
      {phase}
    </Badge>
  );
}
