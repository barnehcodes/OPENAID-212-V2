"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Code, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ZelligePattern } from "@/components/ui/ZelligePattern";
import { motion } from "framer-motion";

export function CTAFooter() {
  return (
    <>
      {/* CTA Section */}
      <section className="py-24 px-6 relative overflow-hidden">
        <ZelligePattern variant="light" />
        <div className="absolute inset-0 bg-gradient-to-b from-openaid-cream to-openaid-blue/10 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-openaid-black mb-4">
            Ready to Make Aid Transparent?
          </h2>
          <p className="text-openaid-dim-text mb-10 max-w-lg mx-auto">
            Join the ecosystem - whether you are donating, distributing, or receiving.
            Every action is verifiable, every dirham accountable.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2 px-8 h-12 text-base"
              >
                Connect Wallet
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/dashboard/transparency">
              <Button
                variant="outline"
                size="lg"
                className="gap-2 px-8 h-12 text-base border-openaid-border hover:bg-openaid-card-bg"
              >
                View Public Ledger
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="bg-openaid-black text-white py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <Image
                  src="/OpenIAD.png"
                  alt="OpenAID +212"
                  width={24}
                  height={24}
                  className="rounded"
                />
                <span className="font-semibold text-lg">
                  <span className="text-[#E84C3D]">OpenAID</span>{" "}
                  <span className="text-[#5DDBAB]">+212</span>
                </span>
              </div>
              <p className="text-white/50 text-sm leading-relaxed max-w-sm">
                Blockchain-based humanitarian aid distribution system for Morocco.
                Built on Hyperledger Besu with QBFT consensus. Every transaction
                is transparent, immutable, and verifiable.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="font-semibold text-sm mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-white/50">
                <li>
                  <Link href="/dashboard/transparency" className="hover:text-white transition-colors">
                    Transparency Explorer
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="hover:text-white transition-colors">
                    Register
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="hover:text-white transition-colors">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-white/50">
                <li>
                  <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer">
                    <FileText className="w-3.5 h-3.5" />
                    Documentation
                  </span>
                </li>
                <li>
                  <span className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer">
                    <Code className="w-3.5 h-3.5" />
                    Source Code
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/40">
              OpenAID +212 - Master&apos;s Thesis Implementation. Built with Hyperledger Besu QBFT.
            </p>
            <div className="flex items-center gap-4 text-xs text-white/40">
              <span>Chain ID: 1337</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>4 Validator Nodes</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-status-green animate-pulse" />
                Network Active
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
