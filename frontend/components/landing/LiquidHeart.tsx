"use client";

import { useEffect, useState } from "react";

interface LiquidHeartProps {
  /** Fill percentage 0-100 */
  percentage: number;
  /** Label below the heart */
  label: string;
  /** Color for the fill */
  color?: string;
  /** Size in pixels */
  size?: number;
}

export function LiquidHeart({
  percentage,
  label,
  color = "#4A70A9",
  size = 100,
}: LiquidHeartProps) {
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(percentage), 200);
    return () => clearTimeout(timer);
  }, [percentage]);

  // The fill level — SVG heart viewBox is 0-100 vertically
  // Higher fillY = less fill (SVG y=0 is top)
  const fillY = 100 - animatedPct;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={`heart-clip-${label.replace(/\s/g, "-")}`}>
              <path d="M50 88 C25 65, 2 45, 2 28 C2 14, 14 2, 28 2 C36 2, 44 7, 50 16 C56 7, 64 2, 72 2 C86 2, 98 14, 98 28 C98 45, 75 65, 50 88Z" />
            </clipPath>
          </defs>

          {/* Heart outline */}
          <path
            d="M50 88 C25 65, 2 45, 2 28 C2 14, 14 2, 28 2 C36 2, 44 7, 50 16 C56 7, 64 2, 72 2 C86 2, 98 14, 98 28 C98 45, 75 65, 50 88Z"
            fill="none"
            stroke={color}
            strokeWidth="2"
            opacity="0.3"
          />

          {/* Liquid fill */}
          <g clipPath={`url(#heart-clip-${label.replace(/\s/g, "-")})`}>
            {/* Background fill area */}
            <rect
              x="0"
              y={fillY}
              width="100"
              height={100 - fillY}
              fill={color}
              opacity="0.2"
              className="transition-all duration-1000 ease-out"
            />
            {/* Wave effect */}
            <g className="animate-liquid">
              <path
                d={`M0 ${fillY + 3} Q15 ${fillY - 2}, 30 ${fillY + 2} T60 ${fillY + 1} T100 ${fillY + 3} V100 H0 Z`}
                fill={color}
                opacity="0.6"
                className="transition-all duration-1000 ease-out"
              />
              <path
                d={`M0 ${fillY + 5} Q20 ${fillY}, 40 ${fillY + 4} T80 ${fillY + 2} T100 ${fillY + 5} V100 H0 Z`}
                fill={color}
                opacity="0.4"
                className="transition-all duration-1000 ease-out"
              />
            </g>
          </g>
        </svg>

        {/* Percentage overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-semibold text-sm"
            style={{ color }}
          >
            {animatedPct}%
          </span>
        </div>
      </div>
      <span className="text-xs font-medium text-openaid-dim-text text-center leading-tight">
        {label}
      </span>
    </div>
  );
}
