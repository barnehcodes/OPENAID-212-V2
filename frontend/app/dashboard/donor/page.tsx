"use client";

import { TopBar } from "@/components/dashboard";
import { RoleGate } from "@/components/dashboard";
import { DonorStats, DonateForm, VotingPower, ElectionPanel, SamaritanScore, ActivityFeed } from "@/components/donor";
import { CrisisCard } from "@/components/shared";
import { useActiveCrisis } from "@/hooks/useCrisis";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { formatEther } from "viem";

export default function DonorDashboardPage() {
  const { crisis, selectedId, setSelectedId, crisisCount } = useActiveCrisis();
  const { address } = useAccount();

  const { data: escrow } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "crisisEscrow",
    args: [BigInt(selectedId)],
    enabled: selectedId > 0,
  });

  const { data: contribution } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "donorContribution",
    args: address ? [address, BigInt(selectedId)] : undefined,
    enabled: !!address && selectedId > 0,
  });

  const { data: electionRound } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "electionRound",
    args: [BigInt(selectedId)],
    enabled: selectedId > 0,
  });

  const escrowVal = escrow ? formatEther(escrow as bigint) : "0";
  const contributionVal = contribution ? Number(formatEther(contribution as bigint)) : 0;
  const escrowNum = escrow ? Number(formatEther(escrow as bigint)) : 0;

  return (
    <RoleGate allowedRoles={["Donor", "PrivateCompany"]}>
      <TopBar
        title="Donor Dashboard"
        subtitle="Donate, vote, and track your humanitarian contributions"
        phase={crisis?.phase}
        crisisId={selectedId}
        crisisCount={crisisCount}
        onCrisisChange={setSelectedId}
      />

      <div className="p-6 lg:p-8 space-y-6">
        {/* Stats row */}
        <DonorStats crisisId={selectedId} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Crisis overview */}
            <CrisisCard
              crisisId={selectedId}
              name={crisis?.description || `Crisis #${selectedId}`}
              phase={crisis?.phase || "DECLARED"}
              escrowTotal={`${escrowVal} AID`}
              distributed="-"
              distributionPct={escrowNum > 0 ? 61 : 0}
              beneficiaryCount={0}
              coordinator={crisis?.coordinator}
            />

            {/* Donate form */}
            <DonateForm crisisId={selectedId} phase={crisis?.phase || "DECLARED"} />

            {/* Election */}
            <ElectionPanel
              crisisId={selectedId}
              phase={crisis?.phase || "DECLARED"}
              coordinator={crisis?.coordinator}
              electionRound={electionRound ? Number(electionRound) : 0}
            />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <VotingPower
              contribution={contributionVal}
              baseCap={1}
              role="Donor"
            />
            <SamaritanScore crisisId={selectedId} />
            <ActivityFeed />
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
