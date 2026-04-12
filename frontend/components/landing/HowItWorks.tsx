"use client";

import { Megaphone, Vote, Heart, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

const steps = [
  {
    icon: Megaphone,
    title: "Declare",
    subtitle: "Crisis Identification",
    description:
      "Government Organizations declare a crisis through tiered multisig authorization. Three tiers of authority ensure no single entity can fabricate a crisis.",
    color: "text-status-red",
    bg: "bg-status-red/10",
  },
  {
    icon: Vote,
    title: "Vote",
    subtitle: "Democratic Election",
    description:
      "Verified stakeholders vote for a crisis coordinator. GO vote compression prevents institutional capture — if all GOs vote unanimously, their votes compress to one.",
    color: "text-openaid-deep-blue",
    bg: "bg-openaid-deep-blue/10",
  },
  {
    icon: Heart,
    title: "Donate",
    subtitle: "Transparent Contributions",
    description:
      "Donors contribute fungible tokens or in-kind items. Every dirham is tracked on-chain. Donations above the threshold grant governance voting power.",
    color: "text-status-green",
    bg: "bg-status-green/10",
  },
  {
    icon: ShieldCheck,
    title: "Verify",
    subtitle: "Three-Way Confirmation",
    description:
      "Coordinator distributes, beneficiary confirms receipt, donor tracks delivery. Three independent confirmations form an immutable proof of aid delivery.",
    color: "text-status-amber",
    bg: "bg-status-amber/10",
  },
];

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12 },
  },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-6 bg-white/40">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-openaid-black">
            How It Works
          </h2>
          <p className="mt-3 text-openaid-dim-text max-w-xl mx-auto">
            Four steps from crisis declaration to verified aid delivery
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {steps.map((step, i) => (
            <motion.div key={step.title} variants={item}>
              <Card className="relative bg-openaid-card-bg border-openaid-border p-6 h-full hover:shadow-md transition-shadow">
                {/* Step number */}
                <div className="absolute top-4 right-4 text-5xl font-bold text-openaid-border/60 font-display leading-none">
                  {i + 1}
                </div>

                <div className={`w-12 h-12 rounded-xl ${step.bg} flex items-center justify-center mb-4`}>
                  <step.icon className={`w-6 h-6 ${step.color}`} />
                </div>

                <h3 className="text-lg font-bold text-openaid-black mb-1">
                  {step.title}
                </h3>
                <p className="text-xs font-medium text-openaid-mid-gray uppercase tracking-wider mb-3">
                  {step.subtitle}
                </p>
                <p className="text-sm text-openaid-dim-text leading-relaxed">
                  {step.description}
                </p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
