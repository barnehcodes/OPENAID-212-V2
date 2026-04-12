"use client";

import { motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";

interface ReputationBarProps {
  label: string;
  score: number;
  trend?: string;
  flagged?: boolean;
}

export function ReputationBar({ label, score, trend, flagged }: ReputationBarProps) {
  const barColor = flagged
    ? "bg-status-red"
    : score >= 80
      ? "bg-status-green"
      : score >= 50
        ? "bg-status-amber"
        : "bg-status-red";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-openaid-black">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${flagged ? "text-status-red" : "text-openaid-dim-text"}`}>
            {score}/100
          </span>
          {trend && (
            <span className={`text-xs ${trend.startsWith("-") ? "text-status-red" : "text-status-green"}`}>
              {trend}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-openaid-border overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className={`absolute inset-y-0 left-0 rounded-full ${barColor}`}
        />
      </div>
      {flagged && (
        <div className="mt-1 text-xs text-status-red flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" />
          Misconduct detected — under review
        </div>
      )}
    </div>
  );
}
