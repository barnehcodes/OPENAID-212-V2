"use client";

import { ArrowUpRight, ArrowDownRight, Vote, CheckCircle2, AlertTriangle, Package } from "lucide-react";
import { AddressBadge } from "@/components/ui/AddressBadge";

export interface FeedItem {
  id: string;
  type: "donation" | "distribution" | "vote" | "confirm" | "misconduct" | "inkind";
  description: string;
  address?: string;
  amount?: string;
  timestamp: string;
}

const typeConfig: Record<FeedItem["type"], { icon: typeof ArrowUpRight; color: string; bg: string }> = {
  donation:     { icon: ArrowUpRight, color: "text-status-green", bg: "bg-status-green/10" },
  distribution: { icon: ArrowDownRight, color: "text-openaid-deep-blue", bg: "bg-openaid-deep-blue/10" },
  vote:         { icon: Vote, color: "text-status-amber", bg: "bg-status-amber/10" },
  confirm:      { icon: CheckCircle2, color: "text-status-green", bg: "bg-status-green/10" },
  misconduct:   { icon: AlertTriangle, color: "text-status-red", bg: "bg-status-red/10" },
  inkind:       { icon: Package, color: "text-openaid-blue", bg: "bg-openaid-blue/10" },
};

export function TransactionFeed({ items }: { items: FeedItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-openaid-mid-gray text-sm">
        No recent activity
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const config = typeConfig[item.type];
        const Icon = config.icon;
        return (
          <div key={item.id} className="flex items-start gap-3 py-2">
            <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-openaid-black">{item.description}</p>
              <div className="flex items-center gap-2 mt-1">
                {item.address && <AddressBadge address={item.address} />}
                {item.amount && (
                  <span className="text-xs font-mono text-openaid-dim-text">{item.amount}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-openaid-mid-gray whitespace-nowrap flex-shrink-0">
              {item.timestamp}
            </span>
          </div>
        );
      })}
    </div>
  );
}
