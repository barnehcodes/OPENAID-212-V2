"use client";

import { Card } from "@/components/ui/card";
import { Landmark, Merge, Split } from "lucide-react";
import { motion } from "framer-motion";

interface CompressionIndicatorProps {
  goCount: number;
  unanimousCandidate?: string;
  isUnanimous: boolean;
}

export function CompressionIndicator({
  goCount,
  unanimousCandidate,
  isUnanimous,
}: CompressionIndicatorProps) {
  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <h3 className="font-semibold text-openaid-black mb-4">GO Vote Compression</h3>

      <div className="flex flex-col items-center gap-4 py-4">
        {/* GO icons */}
        <div className="flex items-center gap-2">
          {Array.from({ length: goCount }).map((_, i) => (
            <motion.div
              key={i}
              animate={
                isUnanimous
                  ? { x: (goCount / 2 - i - 0.5) * -24, opacity: i === 0 ? 1 : 0.3, scale: i === 0 ? 1.2 : 0.8 }
                  : { x: 0, opacity: 1, scale: 1 }
              }
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="w-10 h-10 rounded-full bg-openaid-deep-blue/10 flex items-center justify-center"
            >
              <Landmark className="w-5 h-5 text-openaid-deep-blue" />
            </motion.div>
          ))}
        </div>

        {/* Arrow + result */}
        <div className="flex items-center gap-2">
          {isUnanimous ? (
            <>
              <Merge className="w-5 h-5 text-status-green" />
              <span className="text-sm font-semibold text-status-green">
                Unanimous - Compressed to 1 vote
              </span>
            </>
          ) : (
            <>
              <Split className="w-5 h-5 text-status-amber" />
              <span className="text-sm font-semibold text-status-amber">
                Split vote - each counts individually
              </span>
            </>
          )}
        </div>

        {isUnanimous && unanimousCandidate && (
          <p className="text-xs text-openaid-dim-text font-mono">
            All GOs voted for: {unanimousCandidate.slice(0, 6)}...{unanimousCandidate.slice(-4)}
          </p>
        )}
      </div>

      {/* Explanation */}
      <div className="bg-openaid-deep-blue/5 rounded-lg p-4 mt-4">
        <p className="text-xs text-openaid-dim-text leading-relaxed">
          <strong className="text-openaid-black">Anti-capture mechanism:</strong>{" "}
          If all Government Organizations vote for the same candidate, their combined votes compress
          to a single vote. This prevents institutional capture - GOs cannot dominate the election
          by voting unanimously. The mechanism incentivizes genuine deliberation.
        </p>
      </div>
    </Card>
  );
}
