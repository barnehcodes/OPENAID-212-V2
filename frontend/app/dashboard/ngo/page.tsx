"use client";

import { TopBar, RoleGate } from "@/components/dashboard";
import { DonorStats, DonateForm, VotingPower, ElectionPanel, ActivityFeed } from "@/components/donor";
import { VerificationStatus, CandidacyPanel } from "@/components/ngo";
import { AdminTools } from "@/components/go";
import { CrisisCard, ReputationScore, BeneficiaryList } from "@/components/shared";
import { useActiveCrisis } from "@/hooks/useCrisis";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { formatEther } from "viem";

export default function NGODashboardPage() {
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

  return (
    <RoleGate allowedRoles={["NGO"]}>
      <TopBar
        title="NGO Dashboard"
        subtitle="Donate, run for coordinator, and manage aid operations"
        phase={crisis?.phase}
        crisisId={selectedId}
        crisisCount={crisisCount}
        onCrisisChange={setSelectedId}
      />

      <div className="p-6 lg:p-8 space-y-6">
        <VerificationStatus />
        <DonorStats crisisId={selectedId} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <CrisisCard
              crisisId={selectedId}
              name={crisis?.description || `Crisis #${selectedId}`}
              phase={crisis?.phase || "DECLARED"}
              escrowTotal={`${escrowVal} AID`}
              distributed="--"
              distributionPct={0}
              beneficiaryCount={0}
              coordinator={crisis?.coordinator}
            />
            <DonateForm crisisId={selectedId} phase={crisis?.phase || "DECLARED"} />
            <CandidacyPanel crisisId={selectedId} phase={crisis?.phase || "DECLARED"} />
            <ElectionPanel
              crisisId={selectedId}
              phase={crisis?.phase || "DECLARED"}
              coordinator={crisis?.coordinator}
              electionRound={electionRound ? Number(electionRound) : 0}
            />
            <AdminTools />
            <BeneficiaryList />
          </div>

          <div className="space-y-6">
            <VotingPower contribution={contributionVal} baseCap={1} role="NGO" />
            <ReputationScore role="NGO" />
            <ActivityFeed />
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
