"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { Coins, Users, PackageCheck, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const phases = ["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"] as const;

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <span className="animate-count-up">
      {count.toLocaleString()}{suffix}
    </span>
  );
}

export function LiveStats() {
  const activePhase = 2; // ACTIVE

  return (
    <section className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Card className="bg-openaid-card-bg border-openaid-border p-8 md:p-12">
            {/* Phase stepper */}
            <div className="flex items-center justify-center gap-1 mb-10 flex-wrap">
              {phases.map((phase, i) => (
                <div key={phase} className="flex items-center">
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      i === activePhase
                        ? "bg-status-red text-white"
                        : i < activePhase
                          ? "bg-status-green/20 text-status-green"
                          : "bg-openaid-border text-openaid-mid-gray"
                    }`}
                  >
                    {phase}
                  </div>
                  {i < phases.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-openaid-mid-gray mx-1" />
                  )}
                </div>
              ))}
            </div>

            {/* Gauges row */}
            <div className="flex items-center justify-center gap-12 md:gap-20 mb-12">
              <RadialGauge value={73} label="FT Donations" size={120} color="#4A70A9" />
              <RadialGauge value={45} label="In-Kind Aid" size={120} color="#4CAF8B" />
              <RadialGauge value={61} label="Distributed" size={120} color="#D4A03A" />
            </div>

            {/* Animated counters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-4 bg-white/60 rounded-xl p-5 border border-openaid-border">
                <div className="w-12 h-12 rounded-xl bg-openaid-deep-blue/10 flex items-center justify-center">
                  <Coins className="w-6 h-6 text-openaid-deep-blue" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-openaid-black">
                    <AnimatedCounter target={3240} suffix=" ETH" />
                  </div>
                  <div className="text-xs text-openaid-mid-gray">Total Donated</div>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-white/60 rounded-xl p-5 border border-openaid-border">
                <div className="w-12 h-12 rounded-xl bg-status-green/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-status-green" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-openaid-black">
                    <AnimatedCounter target={186} />
                  </div>
                  <div className="text-xs text-openaid-mid-gray">Verified Actors</div>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-white/60 rounded-xl p-5 border border-openaid-border">
                <div className="w-12 h-12 rounded-xl bg-status-amber/10 flex items-center justify-center">
                  <PackageCheck className="w-6 h-6 text-status-amber" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-openaid-black">
                    <AnimatedCounter target={1847} />
                  </div>
                  <div className="text-xs text-openaid-mid-gray">Distributions</div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
