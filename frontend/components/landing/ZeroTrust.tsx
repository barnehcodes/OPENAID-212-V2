"use client";

import { ShieldAlert, TrendingDown, Eye } from "lucide-react";
import { ZelligePattern } from "@/components/ui/ZelligePattern";
import { motion } from "framer-motion";

const actors = [
  { label: "Coordinator A", score: 92, trend: "+3" },
  { label: "NGO Relief Fund", score: 78, trend: "-5" },
  { label: "GO Regional Auth", score: 95, trend: "+1" },
  { label: "Coordinator B", score: 34, trend: "-22", flagged: true },
];

export function ZeroTrust() {
  return (
    <section className="py-20 px-6 bg-openaid-black text-white relative overflow-hidden">
      <ZelligePattern variant="dark" />
      <div className="relative max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
        >
          {/* Left — message */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-6">
              <ShieldAlert className="w-4 h-4 text-status-red" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Zero Trust Architecture
              </span>
            </div>

            <h2 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-6">
              Every Actor is a{" "}
              <span className="text-status-red">Potential Malicious Actor</span>
            </h2>

            <p className="text-white/60 leading-relaxed mb-6">
              OpenAID +212 assumes no one is trustworthy by default. Every participant
              — including government organizations and NGOs — is subject to continuous
              reputation scoring. Misconduct triggers quadratic penalties, escrow
              freezes, and potential banning.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <TrendingDown className="w-5 h-5 text-status-red mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Quadratic Penalties</div>
                  <div className="text-xs text-white/50">
                    Repeat offenders face exponentially increasing score reductions
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Eye className="w-5 h-5 text-status-amber mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Public Accountability</div>
                  <div className="text-xs text-white/50">
                    All actions are on-chain and publicly auditable by any participant
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right — reputation bars */}
          <div className="bg-white/5 rounded-2xl border border-white/10 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-6">
              Live Reputation Scores
            </div>
            <div className="space-y-5">
              {actors.map((actor) => (
                <div key={actor.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{actor.label}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-mono ${
                          actor.flagged ? "text-status-red" : "text-white/60"
                        }`}
                      >
                        {actor.score}/100
                      </span>
                      <span
                        className={`text-xs ${
                          actor.trend.startsWith("-")
                            ? "text-status-red"
                            : "text-status-green"
                        }`}
                      >
                        {actor.trend}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${actor.score}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className={`absolute inset-y-0 left-0 rounded-full ${
                        actor.flagged
                          ? "bg-status-red"
                          : actor.score >= 80
                            ? "bg-status-green"
                            : "bg-status-amber"
                      }`}
                    />
                  </div>
                  {actor.flagged && (
                    <div className="mt-1 text-xs text-status-red flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      Misconduct detected — under review
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
