"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Heart,
  Vote,
  Shield,
  Users,
  Eye,
  Package,
  Megaphone,
  CheckCircle2,
  Building2,
  Landmark,
  UserCheck,
  Award,
  Wallet,
} from "lucide-react";
import { useParticipant, type Role } from "@/hooks/useParticipant";
import { AddressBadge } from "@/components/ui/AddressBadge";
import { Badge } from "@/components/ui/badge";
import { ZelligePattern } from "@/components/ui/ZelligePattern";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const roleNavItems: Record<Role, NavItem[]> = {
  Donor: [
    { label: "Dashboard", href: "/dashboard/donor", icon: LayoutDashboard },
    { label: "Donate", href: "/dashboard/donor#donate", icon: Heart },
    { label: "Voting", href: "/dashboard/donor#voting", icon: Vote },
    { label: "Samaritan Score", href: "/dashboard/donor#samaritan", icon: Award },
    { label: "Transparency", href: "/dashboard/transparency", icon: Eye },
  ],
  Beneficiary: [
    { label: "Dashboard", href: "/dashboard/beneficiary", icon: LayoutDashboard },
    { label: "My Aid", href: "/dashboard/beneficiary#aid", icon: Package },
    { label: "Confirm Receipt", href: "/dashboard/beneficiary#confirm", icon: CheckCircle2 },
    { label: "Transparency", href: "/dashboard/transparency", icon: Eye },
  ],
  NGO: [
    { label: "Dashboard", href: "/dashboard/ngo", icon: LayoutDashboard },
    { label: "Donate", href: "/dashboard/ngo#donate", icon: Heart },
    { label: "Voting", href: "/dashboard/ngo#voting", icon: Vote },
    { label: "Candidacy", href: "/dashboard/ngo#candidacy", icon: Building2 },
    { label: "Samaritan Score", href: "/dashboard/ngo#samaritan", icon: Award },
    { label: "Transparency", href: "/dashboard/transparency", icon: Eye },
  ],
  GO: [
    { label: "Dashboard", href: "/dashboard/go", icon: LayoutDashboard },
    { label: "Donate", href: "/dashboard/go#donate", icon: Heart },
    { label: "Voting", href: "/dashboard/go#voting", icon: Vote },
    { label: "Admin Tools", href: "/dashboard/go#admin", icon: Shield },
    { label: "Verification", href: "/dashboard/go#verify", icon: UserCheck },
    { label: "Transparency", href: "/dashboard/transparency", icon: Eye },
  ],
  PrivateCompany: [
    { label: "Dashboard", href: "/dashboard/donor", icon: LayoutDashboard },
    { label: "Donate", href: "/dashboard/donor#donate", icon: Heart },
    { label: "Transparency", href: "/dashboard/transparency", icon: Eye },
  ],
};

const coordinatorNavItems: NavItem[] = [
  { label: "Command Center", href: "/dashboard/coordinator", icon: Megaphone },
  { label: "Distribute", href: "/dashboard/coordinator#distribute", icon: Package },
  { label: "Beneficiary Ledger", href: "/dashboard/coordinator#ledger", icon: Users },
];

const roleBadgeColors: Record<Role, string> = {
  Donor: "bg-status-green/20 text-status-green",
  Beneficiary: "bg-openaid-blue/20 text-openaid-blue",
  NGO: "bg-status-amber/20 text-status-amber",
  GO: "bg-openaid-deep-blue/20 text-openaid-deep-blue",
  PrivateCompany: "bg-openaid-mid-gray/20 text-openaid-mid-gray",
};

interface SidebarProps {
  isCoordinator?: boolean;
}

export function Sidebar({ isCoordinator }: SidebarProps) {
  const pathname = usePathname();
  const { participant, address } = useParticipant();

  const role: Role = participant?.role ?? "Donor";
  const navItems = roleNavItems[role] ?? roleNavItems.Donor;

  return (
    <aside className="w-[220px] bg-[#0D0D0D] text-white flex-shrink-0 flex flex-col relative overflow-hidden">
      <ZelligePattern variant="dark" className="opacity-30" />

      {/* Logo */}
      <div className="relative z-10 p-4 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/OpenIAD.png" alt="OpenAID" width={32} height={32} className="rounded-lg" />
          <span className="font-semibold text-sm">
            <span className="text-[#E84C3D]">OpenAID</span>{" "}
            <span className="text-[#5DDBAB]">+212</span>
          </span>
        </Link>
      </div>

      {/* Coordinator section */}
      {isCoordinator && (
        <div className="relative z-10 border-b border-white/10">
          <div className="px-3 pt-4 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-status-amber">
              Coordinator
            </span>
          </div>
          {coordinatorNavItems.map((item) => {
            const active = pathname === item.href.split("#")[0];
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-status-amber/20 text-status-amber"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Role nav */}
      <nav className="relative z-10 flex-1 overflow-y-auto py-4">
        <div className="px-3 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            {role === "PrivateCompany" ? "Company" : role}
          </span>
        </div>
        {navItems.map((item) => {
          const active = pathname === item.href.split("#")[0];
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 mx-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Wallet + role at bottom */}
      <div className="relative z-10 p-4 border-t border-white/10">
        {participant?.isRegistered ? (
          <div className="space-y-2">
            <Badge className={`text-[10px] ${roleBadgeColors[role]}`}>
              {role === "PrivateCompany" ? "Company" : role}
              {participant.isVerified && " (Verified)"}
            </Badge>
            {address && (
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3 h-3 text-white/40" />
                <span className="text-xs font-mono text-white/50 truncate">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-white/40">Not connected</div>
        )}
      </div>
    </aside>
  );
}
