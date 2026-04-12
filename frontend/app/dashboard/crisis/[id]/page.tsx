"use client";

import { use } from "react";
import { Card } from "@/components/ui/card";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { AddressBadge } from "@/components/ui/AddressBadge";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { StatsCard, TransactionFeed, type FeedItem } from "@/components/shared";
import { useCrisis } from "@/hooks/useCrisis";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { formatEther } from "viem";
import { Coins, Users, Vote, Crown, ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const phases = ["DECLARED", "VOTING", "ACTIVE", "REVIEW", "CLOSED"] as const;
const phaseIndex: Record<string, number> = { DECLARED: 0, VOTING: 1, ACTIVE: 2, REVIEW: 3, PAUSED: 3, CLOSED: 4 };

const mockFeed: FeedItem[] = [
  { id: "1", type: "donation", description: "FT Donation received", amount: "5.0 AID", timestamp: "2 min ago" },
  { id: "2", type: "distribution", description: "FT distributed to beneficiary", amount: "1.2 AID", timestamp: "15 min ago" },
  { id: "3", type: "vote", description: "Vote cast in election", timestamp: "1 hour ago" },
  { id: "4", type: "confirm", description: "Beneficiary confirmed receipt", amount: "0.8 AID", timestamp: "2 hours ago" },
  { id: "5", type: "inkind", description: "In-kind donation: Medical kit", timestamp: "3 hours ago" },
];

export default function CrisisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const crisisId = Number(id);
  const { crisis, isLoading } = useCrisis(crisisId);

  const { data: escrow } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "crisisEscrow",
    args: [BigInt(crisisId)],
    enabled: crisisId > 0,
  });

  const { data: candidates } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "getCandidates",
    args: [BigInt(crisisId)],
    enabled: crisisId > 0,
  });

  const escrowVal = escrow ? formatEther(escrow as bigint) : "0";
  const candidateList = (candidates as string[]) ?? [];
  const currentPhase = crisis?.phase ?? "DECLARED";
  const currentPhaseIdx = phaseIndex[currentPhase] ?? 0;
  const hasCoordinator = crisis?.coordinator && crisis.coordinator !== "0x0000000000000000000000000000000000000000";

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 border-b border-openaid-border bg-openaid-cream/80">
        <Link href="/dashboard/transparency">
          <Button variant="ghost" size="sm" className="gap-1 mb-3 -ml-2 text-openaid-dim-text">
            <ArrowLeft className="w-4 h-4" /> Back to Explorer
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-openaid-black">
              Crisis #{crisisId}
            </h1>
            <p className="text-sm text-openaid-dim-text mt-1">
              {crisis?.description || (isLoading ? "Loading..." : "Crisis not found")}
            </p>
          </div>
          <PhaseBadge phase={currentPhase} />
        </div>
      </div>

      <div className="p-6 lg:p-8 space-y-6">
        {/* Phase timeline */}
        <Card className="bg-openaid-card-bg border-openaid-border p-6">
          <h3 className="font-semibold text-openaid-black mb-4">Crisis Lifecycle</h3>
          <div className="flex items-center justify-between">
            {phases.map((phase, i) => (
              <div key={phase} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === currentPhaseIdx
                        ? "bg-status-red text-white"
                        : i < currentPhaseIdx
                          ? "bg-status-green text-white"
                          : "bg-openaid-border text-openaid-mid-gray"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[10px] font-medium text-openaid-mid-gray mt-1.5">{phase}</span>
                </div>
                {i < phases.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 ${i < currentPhaseIdx ? "bg-status-green" : "bg-openaid-border"}`} />
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard icon={Coins} label="Escrow Total" value={`${escrowVal} AID`} iconColor="text-status-amber" iconBg="bg-status-amber/10" />
          <StatsCard icon={Coins} label="Distributed" value="--" iconColor="text-status-green" iconBg="bg-status-green/10" />
          <StatsCard icon={Users} label="Candidates" value={candidateList.length} iconColor="text-openaid-deep-blue" iconBg="bg-openaid-deep-blue/10" />
          <StatsCard icon={Vote} label="Yes / No Votes" value={`${crisis?.yesVotes ?? 0} / ${crisis?.noVotes ?? 0}`} iconColor="text-status-amber" iconBg="bg-status-amber/10" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left - details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Coordinator */}
            <Card className="bg-openaid-card-bg border-openaid-border p-6">
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-5 h-5 text-status-amber" />
                <h3 className="font-semibold text-openaid-black">Coordinator</h3>
              </div>
              {hasCoordinator ? (
                <AddressBadge address={crisis!.coordinator} />
              ) : (
                <p className="text-sm text-openaid-mid-gray">No coordinator elected yet</p>
              )}
            </Card>

            {/* Candidates */}
            <Card className="bg-openaid-card-bg border-openaid-border p-6">
              <h3 className="font-semibold text-openaid-black mb-3">Registered Candidates</h3>
              {candidateList.length > 0 ? (
                <div className="space-y-2">
                  {candidateList.map((c, i) => (
                    <div key={c} className="flex items-center gap-3 bg-white/60 rounded-lg border border-openaid-border p-3">
                      <div className="w-7 h-7 rounded-full bg-openaid-deep-blue/10 flex items-center justify-center text-xs font-bold text-openaid-deep-blue">
                        {i + 1}
                      </div>
                      <AddressBadge address={c} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-openaid-mid-gray">No candidates registered</p>
              )}
            </Card>

            {/* Transaction feed */}
            <Card className="bg-openaid-card-bg border-openaid-border p-6">
              <h3 className="font-semibold text-openaid-black mb-4">Recent Activity</h3>
              <TransactionFeed items={mockFeed} />
            </Card>
          </div>

          {/* Right - gauges */}
          <div className="space-y-6">
            <Card className="bg-openaid-card-bg border-openaid-border p-6 flex flex-col items-center">
              <h3 className="font-semibold text-openaid-black mb-4">Distribution Progress</h3>
              <RadialGauge value={61} label="Funds Distributed" size={140} strokeWidth={10} color="auto" />
            </Card>
            <Card className="bg-openaid-card-bg border-openaid-border p-6 flex flex-col items-center">
              <h3 className="font-semibold text-openaid-black mb-4">Confirmation Rate</h3>
              <RadialGauge value={84} label="Beneficiary Confirmed" size={140} strokeWidth={10} color="#4CAF8B" />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
