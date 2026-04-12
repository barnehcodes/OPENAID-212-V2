"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { useParticipant } from "@/hooks/useParticipant";
import { Crown, Loader2 } from "lucide-react";
import type { Phase } from "@/hooks/useCrisis";

interface CandidacyPanelProps {
  crisisId: number;
  phase: Phase;
}

export function CandidacyPanel({ crisisId, phase }: CandidacyPanelProps) {
  const { participant } = useParticipant();
  const verified = participant?.isVerified ?? false;

  const { writeAsync: register, isPending } = useScaffoldContractWrite({
    contractName: "Governance",
    functionName: "registerAsCandidate",
  });

  const canRegister = verified && (phase === "DECLARED" || phase === "PAUSED");

  const handleRegister = async () => {
    await register([BigInt(crisisId)]);
  };

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="candidacy">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-5 h-5 text-status-amber" />
        <h3 className="font-semibold text-openaid-black">Run for Coordinator</h3>
      </div>

      <p className="text-sm text-openaid-dim-text mb-4">
        Verified NGOs that meet the 10x donation cap threshold can register as coordinator candidates.
        If elected, you gain distribution authority (not funds) for the crisis escrow.
      </p>

      {!verified && (
        <div className="bg-status-amber/10 border border-status-amber/30 rounded-lg px-4 py-3 text-sm text-status-amber mb-4">
          You must be verified before registering as a candidate
        </div>
      )}

      <Button
        className="w-full bg-status-amber hover:bg-status-amber/90 text-white gap-2"
        disabled={!canRegister || isPending}
        onClick={handleRegister}
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
        {canRegister ? "Register as Candidate" : phase === "VOTING" ? "Registration closed - voting in progress" : "Not available in this phase"}
      </Button>
    </Card>
  );
}
