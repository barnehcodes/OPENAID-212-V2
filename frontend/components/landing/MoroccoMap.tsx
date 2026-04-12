"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CrisisPoint {
  id: number;
  name: string;
  region: string;
  status: "active" | "resolved" | "monitoring";
  donated: string;
  beneficiaries: number;
  /** Position as percentage of the map container */
  x: number;
  y: number;
}

const crisisPoints: CrisisPoint[] = [
  {
    id: 1,
    name: "Al-Haouz Earthquake",
    region: "Marrakech-Safi",
    status: "active",
    donated: "2,450 ETH",
    beneficiaries: 1240,
    x: 38,
    y: 58,
  },
  {
    id: 2,
    name: "Taroudant Flood",
    region: "Souss-Massa",
    status: "active",
    donated: "340 ETH",
    beneficiaries: 320,
    x: 32,
    y: 68,
  },
  {
    id: 3,
    name: "Errachidia Drought",
    region: "Draa-Tafilalet",
    status: "monitoring",
    donated: "120 ETH",
    beneficiaries: 180,
    x: 55,
    y: 55,
  },
  {
    id: 4,
    name: "Chefchaouen Landslide",
    region: "Tanger-Tetouan",
    status: "resolved",
    donated: "890 ETH",
    beneficiaries: 540,
    x: 40,
    y: 18,
  },
  {
    id: 5,
    name: "Ouarzazate Heat Wave",
    region: "Draa-Tafilalet",
    status: "monitoring",
    donated: "75 ETH",
    beneficiaries: 90,
    x: 50,
    y: 62,
  },
];

const statusConfig = {
  active: { color: "bg-status-red", ring: "ring-status-red/30", label: "Active", text: "text-status-red" },
  resolved: { color: "bg-status-green", ring: "ring-status-green/30", label: "Resolved", text: "text-status-green" },
  monitoring: { color: "bg-status-amber", ring: "ring-status-amber/30", label: "Monitoring", text: "text-status-amber" },
};

export function MoroccoMap() {
  const [hoveredCrisis, setHoveredCrisis] = useState<CrisisPoint | null>(null);

  return (
    <section id="crisis-map" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-openaid-black">
            Crisis Map
          </h2>
          <p className="mt-3 text-openaid-dim-text max-w-xl mx-auto">
            Real-time view of humanitarian operations across Morocco
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mb-8">
          {(["active", "monitoring", "resolved"] as const).map((status) => (
            <div key={status} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${statusConfig[status].color}`} />
              <span className="text-sm text-openaid-dim-text">{statusConfig[status].label}</span>
            </div>
          ))}
        </div>

        {/* Map container */}
        <div className="relative bg-openaid-card-bg border border-openaid-border rounded-2xl overflow-hidden aspect-[16/10]">
          {/* Simplified Morocco SVG outline */}
          <svg
            viewBox="0 0 800 500"
            className="w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Morocco outline — simplified polygon */}
            <path
              d="M180 60 L320 40 L380 50 L420 30 L460 45 L500 35 L520 55 L540 80
                 L560 120 L580 160 L600 200 L620 240 L640 260 L620 290 L580 310
                 L540 340 L500 360 L460 380 L420 400 L380 410 L340 420 L300 430
                 L260 440 L220 430 L180 400 L160 360 L140 320 L120 280 L100 240
                 L110 200 L130 160 L150 120 L160 90 Z"
              fill="none"
              stroke="#4A70A9"
              strokeWidth="2"
              opacity="0.3"
            />
            {/* Morocco fill */}
            <path
              d="M180 60 L320 40 L380 50 L420 30 L460 45 L500 35 L520 55 L540 80
                 L560 120 L580 160 L600 200 L620 240 L640 260 L620 290 L580 310
                 L540 340 L500 360 L460 380 L420 400 L380 410 L340 420 L300 430
                 L260 440 L220 430 L180 400 L160 360 L140 320 L120 280 L100 240
                 L110 200 L130 160 L150 120 L160 90 Z"
              fill="#4A70A9"
              opacity="0.06"
            />

            {/* Grid lines */}
            {[100, 200, 300, 400].map((y) => (
              <line
                key={`h-${y}`}
                x1="0"
                y1={y}
                x2="800"
                y2={y}
                stroke="#DDD8CC"
                strokeWidth="0.5"
                strokeDasharray="4,4"
              />
            ))}
            {[200, 400, 600].map((x) => (
              <line
                key={`v-${x}`}
                x1={x}
                y1="0"
                x2={x}
                y2="500"
                stroke="#DDD8CC"
                strokeWidth="0.5"
                strokeDasharray="4,4"
              />
            ))}

            {/* City labels */}
            <text x="300" y="115" fontSize="10" fill="#8A8A8A" textAnchor="middle">Tanger</text>
            <text x="350" y="200" fontSize="10" fill="#8A8A8A" textAnchor="middle">Rabat</text>
            <text x="320" y="250" fontSize="10" fill="#8A8A8A" textAnchor="middle">Casablanca</text>
            <text x="340" y="330" fontSize="10" fill="#8A8A8A" textAnchor="middle">Marrakech</text>
            <text x="450" y="310" fontSize="10" fill="#8A8A8A" textAnchor="middle">Ouarzazate</text>
            <text x="280" y="390" fontSize="10" fill="#8A8A8A" textAnchor="middle">Agadir</text>
          </svg>

          {/* Crisis waypoints */}
          {crisisPoints.map((crisis) => {
            const config = statusConfig[crisis.status];
            return (
              <div
                key={crisis.id}
                className="absolute"
                style={{
                  left: `${crisis.x}%`,
                  top: `${crisis.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
                onMouseEnter={() => setHoveredCrisis(crisis)}
                onMouseLeave={() => setHoveredCrisis(null)}
              >
                {/* Pulse ring for active */}
                {crisis.status === "active" && (
                  <div className="absolute inset-0 w-8 h-8 -m-1.5 rounded-full bg-status-red/20 animate-ping" />
                )}
                <div
                  className={`relative w-5 h-5 rounded-full ${config.color} ring-4 ${config.ring} cursor-pointer flex items-center justify-center`}
                >
                  <MapPin className="w-3 h-3 text-white" />
                </div>
              </div>
            );
          })}

          {/* Tooltip */}
          <AnimatePresence>
            {hoveredCrisis && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute z-10 bg-white rounded-xl shadow-lg border border-openaid-border p-4 w-64 pointer-events-none"
                style={{
                  left: `${Math.min(hoveredCrisis.x + 3, 70)}%`,
                  top: `${hoveredCrisis.y - 2}%`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm text-openaid-black">
                    {hoveredCrisis.name}
                  </h4>
                  <span
                    className={`text-xs font-semibold ${statusConfig[hoveredCrisis.status].text}`}
                  >
                    {statusConfig[hoveredCrisis.status].label}
                  </span>
                </div>
                <p className="text-xs text-openaid-mid-gray mb-2">
                  {hoveredCrisis.region}
                </p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-openaid-dim-text">
                    Donated: <strong>{hoveredCrisis.donated}</strong>
                  </span>
                  <span className="text-openaid-dim-text">
                    {hoveredCrisis.beneficiaries.toLocaleString()} beneficiaries
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
