"use client";

import Link from "next/link";
import {
  Heart,
  Landmark,
  Building2,
  Briefcase,
  HandHelping,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

const roles = [
  {
    icon: Heart,
    title: "Donor",
    description:
      "Contribute fungible tokens or in-kind items to active crises. Track your donations on-chain and earn Samaritan Score points.",
    color: "text-status-red",
    bg: "bg-status-red/10",
    href: "/register?role=donor",
  },
  {
    icon: Landmark,
    title: "Government Organization",
    description:
      "Pre-verified at registration. Declare crises, verify NGOs and beneficiaries, and participate in governance with GO vote compression.",
    color: "text-openaid-deep-blue",
    bg: "bg-openaid-deep-blue/10",
    href: "/register?role=go",
  },
  {
    icon: Building2,
    title: "NGO",
    description:
      "Register and get verified by the verification multisig. Run for crisis coordinator, manage exchange centers, distribute aid.",
    color: "text-status-green",
    bg: "bg-status-green/10",
    href: "/register?role=ngo",
  },
  {
    icon: Briefcase,
    title: "Private Company",
    description:
      "Contribute corporate donations to humanitarian crises. CSR-transparent — every contribution is publicly verifiable on the blockchain.",
    color: "text-status-amber",
    bg: "bg-status-amber/10",
    href: "/register?role=company",
  },
  {
    icon: HandHelping,
    title: "Beneficiary",
    description:
      "Receive aid directly from the smart contract. Confirm receipt of monetary and in-kind donations. Your verification is per-crisis.",
    color: "text-openaid-blue",
    bg: "bg-openaid-blue/10",
    href: "/register?role=beneficiary",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function RoleCards() {
  return (
    <section id="about" className="py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-openaid-black">
            Choose Your Role
          </h2>
          <p className="mt-3 text-openaid-dim-text max-w-xl mx-auto">
            Every participant in the ecosystem has a defined role with specific permissions and responsibilities
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {roles.map((role) => (
            <motion.div key={role.title} variants={item}>
              <Link href={role.href}>
                <Card className="bg-openaid-card-bg border-openaid-border p-6 h-full hover:shadow-md hover:border-openaid-deep-blue/30 transition-all group cursor-pointer">
                  <div className={`w-12 h-12 rounded-xl ${role.bg} flex items-center justify-center mb-4`}>
                    <role.icon className={`w-6 h-6 ${role.color}`} />
                  </div>

                  <h3 className="text-lg font-bold text-openaid-black mb-2 flex items-center gap-2">
                    {role.title}
                    <ArrowRight className="w-4 h-4 text-openaid-mid-gray opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </h3>

                  <p className="text-sm text-openaid-dim-text leading-relaxed">
                    {role.description}
                  </p>
                </Card>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
