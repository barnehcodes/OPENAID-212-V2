"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Coins, Users, User } from "lucide-react";
import { motion } from "framer-motion";

interface CrisisEvent {
  id: number;
  name: string;
  region: string;
  status: "active" | "resolved" | "monitoring";
  donated: string;
  beneficiaries: number;
  coordinator?: string;
  date: string;
}

const crises: CrisisEvent[] = [
  {
    id: 1,
    name: "Al-Haouz Earthquake",
    region: "Marrakech-Safi",
    status: "active",
    donated: "2,450 ETH",
    beneficiaries: 1240,
    coordinator: "0xa1b2...c3d4",
    date: "Sep 2023",
  },
  {
    id: 2,
    name: "Taroudant Flood Response",
    region: "Souss-Massa",
    status: "active",
    donated: "340 ETH",
    beneficiaries: 320,
    coordinator: "0xe5f6...7890",
    date: "Jan 2024",
  },
  {
    id: 3,
    name: "Chefchaouen Landslide",
    region: "Tanger-Tetouan",
    status: "resolved",
    donated: "890 ETH",
    beneficiaries: 540,
    date: "Mar 2024",
  },
  {
    id: 4,
    name: "Errachidia Drought",
    region: "Draa-Tafilalet",
    status: "monitoring",
    donated: "120 ETH",
    beneficiaries: 180,
    date: "Jun 2024",
  },
  {
    id: 5,
    name: "Ouarzazate Heat Wave",
    region: "Draa-Tafilalet",
    status: "monitoring",
    donated: "75 ETH",
    beneficiaries: 90,
    date: "Aug 2024",
  },
];

const statusConfig = {
  active:     { className: "bg-status-red/15 text-status-red border-status-red/30", dot: "bg-status-red", label: "Active" },
  resolved:   { className: "bg-status-green/15 text-status-green border-status-green/30", dot: "bg-status-green", label: "Resolved" },
  monitoring: { className: "bg-status-amber/15 text-status-amber border-status-amber/30", dot: "bg-status-amber", label: "Monitoring" },
};

export function CrisisTimeline() {
  return (
    <section id="crisis-map" className="py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-openaid-black">
            Crisis Timeline
          </h2>
          <p className="mt-3 text-openaid-dim-text max-w-xl mx-auto">
            Chronological view of humanitarian operations across Morocco
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mb-10">
          {(["active", "monitoring", "resolved"] as const).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${statusConfig[s].dot}`} />
              <span className="text-sm text-openaid-dim-text">{statusConfig[s].label}</span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-openaid-border md:-translate-x-px" />

          <div className="space-y-8">
            {crises.map((crisis, i) => {
              const config = statusConfig[crisis.status];
              const isLeft = i % 2 === 0;

              return (
                <motion.div
                  key={crisis.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className={`relative flex items-start gap-4 md:gap-8 ${
                    isLeft ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  {/* Date badge (desktop, opposite side) */}
                  <div className={`hidden md:flex w-[calc(50%-2rem)] items-center ${isLeft ? "justify-end" : "justify-start"}`}>
                    <span className="text-sm font-medium text-openaid-mid-gray">{crisis.date}</span>
                  </div>

                  {/* Dot on timeline */}
                  <div className="relative z-10 flex-shrink-0">
                    <div className={`w-3 h-3 rounded-full ${config.dot} ring-4 ring-openaid-cream`} />
                  </div>

                  {/* Card */}
                  <div className="flex-1 md:w-[calc(50%-2rem)]">
                    <Card className="bg-openaid-card-bg border-openaid-border p-5 hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-openaid-black text-sm">{crisis.name}</h3>
                        <Badge variant="outline" className={`text-[10px] ${config.className}`}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-openaid-mid-gray mb-3">{crisis.region}</p>

                      {/* Mobile date */}
                      <p className="text-xs text-openaid-mid-gray mb-3 md:hidden">{crisis.date}</p>

                      <div className="flex items-center gap-4 text-xs text-openaid-dim-text">
                        <span className="flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" />
                          {crisis.donated}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {crisis.beneficiaries}
                        </span>
                        {crisis.coordinator && (
                          <span className="flex items-center gap-1 font-mono">
                            <User className="w-3.5 h-3.5" />
                            {crisis.coordinator}
                          </span>
                        )}
                      </div>
                    </Card>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
