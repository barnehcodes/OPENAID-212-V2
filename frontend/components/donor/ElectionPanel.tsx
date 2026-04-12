"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddressBadge } from "@/components/ui/AddressBadge";
import { useScaffoldContractRead, useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { Vote, Crown, Loader2, CheckCircle2 } from "lucide-react";
import type { Phase } from "@/hooks/useCrisis";

interface ElectionPanelProps {
  crisisId: number;
  phase: Phase;
  coordinator?: string;
  electionRound?: number;
}

export function ElectionPanel({ crisisId, phase, coordinator, electionRound = 0 }: ElectionPanelProps) {
  const { address } = useAccount();

  const { data: candidates } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "getCandidates",
    args: [BigInt(crisisId)],
    enabled: crisisId > 0,
  });

  const { data: hasVoted } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "hasVoted",
    args: address ? [BigInt(crisisId), address, BigInt(electionRound)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  const { writeAsync: castVote, isPending: votePending } = useScaffoldContractWrite({
    contractName: "Governance",
    functionName: "castVote",
  });

  const candidateList = (candidates as string[]) ?? [];
  const voted = hasVoted as boolean;
  const isVotingPhase = phase === "VOTING";
  const hasCoordinator = coordinator && coordinator !== "0x0000000000000000000000000000000000000000";

  const handleVote = async (candidate: string) => {
    await castVote([BigInt(crisisId), candidate]);
  };

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Vote className="w-5 h-5 text-openaid-deep-blue" />
          <h3 className="font-semibold text-openaid-black">Election</h3>
        </div>
        {isVotingPhase && (
          <Badge className="bg-status-amber/15 text-status-amber border-status-amber/30 text-xs">
            Voting Open
          </Badge>
        )}
      </div>

      {/* Elected coordinator */}
      {hasCoordinator && (phase === "ACTIVE" || phase === "REVIEW") && (
        <div className="bg-status-green/10 border border-status-green/30 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-4 h-4 text-status-green" />
            <span className="text-sm font-semibold text-status-green">Elected Coordinator</span>
          </div>
          <AddressBadge address={coordinator!} />
        </div>
      )}

      {/* Candidate list */}
      {candidateList.length > 0 ? (
        <div className="space-y-3">
          {candidateList.map((candidate, i) => (
            <div
              key={candidate}
              className="flex items-center justify-between bg-white/60 rounded-lg border border-openaid-border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-openaid-deep-blue/10 flex items-center justify-center text-xs font-bold text-openaid-deep-blue">
                  {i + 1}
                </div>
                <AddressBadge address={candidate} />
              </div>
              {isVotingPhase && !voted && (
                <Button
                  size="sm"
                  className="bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-1"
                  onClick={() => handleVote(candidate)}
                  disabled={votePending}
                >
                  {votePending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Vote className="w-3 h-3" />}
                  Vote
                </Button>
              )}
              {voted && (
                <span className="text-xs text-status-green flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Voted
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-openaid-mid-gray text-center py-4">
          {isVotingPhase
            ? "No candidates registered yet"
            : phase === "DECLARED"
              ? "Voting has not started - candidates can register"
              : "Election concluded"}
        </p>
      )}
    </Card>
  );
}
