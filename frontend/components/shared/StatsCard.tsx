import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  iconColor?: string;
  iconBg?: string;
}

export function StatsCard({
  icon: Icon,
  label,
  value,
  sub,
  iconColor = "text-openaid-deep-blue",
  iconBg = "bg-openaid-deep-blue/10",
}: StatsCardProps) {
  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-5">
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-openaid-mid-gray font-medium">{label}</p>
          <p className="text-xl font-bold text-openaid-black mt-0.5 truncate">{value}</p>
          {sub && <p className="text-xs text-openaid-dim-text mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}
