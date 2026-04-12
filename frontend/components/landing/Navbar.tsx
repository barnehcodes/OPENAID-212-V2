"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "How it Works", href: "#how-it-works" },
  { label: "Crisis Timeline", href: "#crisis-map" },
  { label: "Transparency", href: "/dashboard/transparency" },
  { label: "About", href: "#about" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-openaid-cream/80 backdrop-blur-md border-b border-openaid-border">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/OpenIAD.png"
            alt="OpenAID +212"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="font-semibold text-lg">
            <span className="text-[#E84C3D]">OpenAID</span>{" "}
            <span className="text-[#2D6A4F]">+212</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-openaid-dim-text hover:text-openaid-black transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Wallet button */}
        <div className="hidden md:flex items-center gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-openaid-dim-text bg-openaid-card-bg px-3 py-1.5 rounded-lg border border-openaid-border">
                {truncated}
              </span>
              <Button variant="outline" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
              onClick={() => connectors[0] && connect({ connector: connectors[0] })}
            >
              <Wallet className="w-4 h-4" />
              Connect Wallet
            </Button>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-openaid-black"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-openaid-cream border-b border-openaid-border px-6 pb-4">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-openaid-dim-text hover:text-openaid-black py-1"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4">
            {isConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-openaid-dim-text">{truncated}</span>
                <Button variant="outline" size="sm" onClick={() => disconnect()}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="w-full bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
                onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
