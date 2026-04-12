"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZelligePattern } from "@/components/ui/ZelligePattern";
import { motion } from "framer-motion";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-20 px-6">
      {/* Zellige pattern background */}
      <ZelligePattern variant="light" />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-openaid-cream via-openaid-cream/90 to-openaid-blue/10 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto text-center">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 bg-openaid-card-bg border border-openaid-border rounded-full px-4 py-1.5 mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-status-green animate-pulse" />
          <span className="text-xs font-medium text-openaid-dim-text">
            Blockchain-verified humanitarian aid on Hyperledger Besu
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl md:text-7xl font-display font-bold text-openaid-black leading-tight tracking-tight"
        >
          Every Dirham,{" "}
          <span className="bg-gradient-to-r from-openaid-deep-blue to-openaid-blue bg-clip-text text-transparent">
            Transparent
          </span>{" "}
          &amp; Accountable
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 text-lg md:text-xl text-openaid-dim-text max-w-2xl mx-auto leading-relaxed"
        >
          Born from the Al-Haouz earthquake response. OpenAID +212 brings full
          transparency to humanitarian aid distribution across Morocco - from
          donation to last-mile delivery.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/register">
            <Button
              size="lg"
              className="bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2 px-8 h-12 text-base"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/dashboard/transparency">
            <Button
              variant="outline"
              size="lg"
              className="gap-2 px-8 h-12 text-base border-openaid-border hover:bg-openaid-card-bg"
            >
              <Search className="w-4 h-4" />
              Explore the Ledger
            </Button>
          </Link>
        </motion.div>

        {/* Trust indicators */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-8 text-openaid-mid-gray"
        >
          <div className="flex items-center gap-2 text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-status-green" />
            4-Node QBFT Consensus
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-status-green" />
            Smart Contract Audited
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-status-green" />
            Zero Gas Fees for Beneficiaries
          </div>
        </motion.div>
      </div>
    </section>
  );
}
