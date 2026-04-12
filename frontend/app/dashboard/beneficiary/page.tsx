"use client";

import { TopBar, RoleGate } from "@/components/dashboard";
import { VerificationBanner, ActionCards, AidSummary, HowAidWorks } from "@/components/beneficiary";
import { ElectionPanel } from "@/components/donor";
import { useActiveCrisis } from "@/hooks/useCrisis";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";

export default function BeneficiaryDashboardPage() {
  const { crisis, selectedId, setSelectedId, crisisCount } = useActiveCrisis();

  const { data: electionRound } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "electionRound",
    args: [BigInt(selectedId)],
    enabled: selectedId > 0,
  });

  return (
    <RoleGate allowedRoles={["Beneficiary"]}>
      <TopBar
        title="My Aid"
        subtitle="View your aid and confirm deliveries"
        phase={crisis?.phase}
        crisisId={selectedId}
        crisisCount={crisisCount}
        onCrisisChange={setSelectedId}
      />

      <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
        {/* Verification status - big and prominent */}
        <VerificationBanner crisisId={selectedId} />

        {/* Action cards - large touch targets */}
        <ActionCards crisisId={selectedId} />

        {/* Vote (if VOTING phase) */}
        {crisis?.phase === "VOTING" && (
          <ElectionPanel
            crisisId={selectedId}
            phase={crisis.phase}
            coordinator={crisis.coordinator}
            electionRound={electionRound ? Number(electionRound) : 0}
          />
        )}

        {/* Aid summary */}
        <AidSummary crisisId={selectedId} />

        {/* Educational content */}
        <HowAidWorks />
      </div>
    </RoleGate>
  );
}
