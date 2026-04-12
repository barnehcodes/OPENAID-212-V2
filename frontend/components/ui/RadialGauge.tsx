"use client";

import { useEffect, useState } from "react";

interface RadialGaugeProps {
  value: number;
  label: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export function RadialGauge({
  value,
  label,
  size = 120,
  strokeWidth = 8,
  color = "#4A70A9",
}: RadialGaugeProps) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(Math.min(100, Math.max(0, value))), 100);
    return () => clearTimeout(timer);
  }, [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;

  const autoColor =
    value >= 75 ? "#4CAF8B" : value >= 40 ? "#D4A03A" : "#D44040";
  const fillColor = color === "auto" ? autoColor : color;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-openaid-border"
            strokeWidth={strokeWidth}
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={fillColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-openaid-black">{animated}%</span>
        </div>
      </div>
      <span className="text-xs font-medium text-openaid-dim-text text-center leading-tight">
        {label}
      </span>
    </div>
  );
}
