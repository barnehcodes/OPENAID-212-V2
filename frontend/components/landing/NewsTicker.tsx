"use client";

import { AlertTriangle, Radio } from "lucide-react";

interface CrisisAlert {
  id: number;
  text: string;
  severity: "critical" | "warning" | "monitoring";
}

const mockAlerts: CrisisAlert[] = [
  { id: 1, text: "Al-Haouz Earthquake Relief - Phase ACTIVE - 2,450 AID distributed", severity: "critical" },
  { id: 2, text: "Taroudant Flood Response - VOTING in progress - 12 candidates registered", severity: "warning" },
  { id: 3, text: "Errachidia Drought Monitoring - Under observation - 340 beneficiaries registered", severity: "monitoring" },
  { id: 4, text: "Chefchaouen Landslide Aid - CLOSED - 890 AID fully distributed & verified", severity: "monitoring" },
  { id: 5, text: "Ouarzazate Heat Wave - DECLARED - Awaiting GO vote initiation", severity: "warning" },
];

const severityColor: Record<CrisisAlert["severity"], string> = {
  critical: "bg-status-red",
  warning: "bg-status-amber",
  monitoring: "bg-openaid-blue",
};

export function NewsTicker() {
  // Double the items for seamless infinite scroll
  const items = [...mockAlerts, ...mockAlerts];

  return (
    <div className="bg-openaid-black text-white overflow-hidden py-2.5">
      <div className="flex items-center">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-4 border-r border-white/20 mr-4">
          <Radio className="w-3.5 h-3.5 text-status-red animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider">Live</span>
        </div>
        <div className="flex animate-ticker">
          {items.map((alert, i) => (
            <div
              key={`${alert.id}-${i}`}
              className="flex items-center gap-2 whitespace-nowrap px-6"
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${severityColor[alert.severity]}`}
              />
              <span className="text-sm text-white/80">{alert.text}</span>
              <AlertTriangle className="w-3 h-3 text-white/30 mx-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
