"use client";

import { TopBar } from "@/components/dashboard";
import { StatsCard } from "@/components/shared";
import {
  EscrowBanner,
  EscrowFlow,
  DistributeForm,
  InKindAssign,
  BeneficiaryLedger,
  AccountabilityNotice,
} from "@/components/coordinator";
import { useActiveCrisis } from "@/hooks/useCrisis";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { Coins, ArrowDownRight, Users, CheckCircle2, Package } from "lucide-react";

export default function CoordinatorDashboardPage() {
  const { crisis, selectedId, setSelectedId, crisisCount } = useActiveCrisis();
  const { address } = useAccount();

  const { data: escrow } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "crisisEscrow",
    args: [BigInt(selectedId)],
    enabled: selectedId > 0,
  });

  const escrowVal = escrow ? formatEther(escrow as bigint) : "0";

  // Check the user is actually the coordinator
  const isCoordinator =
    crisis?.coordinator &&
    address &&
    crisis.coordinator.toLowerCase() === address.toLowerCase() &&
    crisis.coordinator !== "0x0000000000000000000000000000000000000000";

  if (!isCoordinator) {
    return (
      <>
        <TopBar
          title="Coordinator Command Center"
          phase={crisis?.phase}
          crisisId={selectedId}
          crisisCount={crisisCount}
          onCrisisChange={setSelectedId}
        />
        <div className="p-8 text-center">
          <p className="text-openaid-dim-text">
            You are not the elected coordinator for Crisis #{selectedId}.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Coordinator Command Center"
        subtitle={`Distribution authority for Crisis #${selectedId}`}
        phase={crisis?.phase}
        crisisId={selectedId}
        crisisCount={crisisCount}
        onCrisisChange={setSelectedId}
      />

      <div className="p-6 lg:p-8 space-y-6">
        {/* Persistent banners */}
        <EscrowBanner />

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatsCard icon={Coins} label="Escrow Total" value={`${escrowVal} ETH`} iconColor="text-status-amber" iconBg="bg-status-amber/10" />
          <StatsCard icon={ArrowDownRight} label="Distributed" value="—" iconColor="text-status-green" iconBg="bg-status-green/10" />
          <StatsCard icon={Coins} label="Remaining" value={`${escrowVal} ETH`} iconColor="text-openaid-deep-blue" iconBg="bg-openaid-deep-blue/10" />
          <StatsCard icon={Users} label="Beneficiaries" value="—" sub="received / verified" iconColor="text-openaid-blue" iconBg="bg-openaid-blue/10" />
          <StatsCard icon={CheckCircle2} label="Confirmations" value="—" sub="confirmed / distributed" iconColor="text-status-green" iconBg="bg-status-green/10" />
        </div>

        {/* Escrow flow viz */}
        <EscrowFlow escrowTotal={`${escrowVal} ETH`} distributed="0 ETH" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Distribute FT */}
          <DistributeForm crisisId={selectedId} phase={crisis?.phase || "DECLARED"} />
          {/* Assign In-Kind */}
          <InKindAssign crisisId={selectedId} phase={crisis?.phase || "DECLARED"} />
        </div>

        {/* Beneficiary ledger */}
        <BeneficiaryLedger />

        {/* Accountability warning */}
        <AccountabilityNotice />
      </div>
    </>
  );
}
