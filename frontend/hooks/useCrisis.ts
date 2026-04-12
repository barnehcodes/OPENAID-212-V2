"use client";

import { useState } from "react";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";

export type Phase = "DECLARED" | "VOTING" | "ACTIVE" | "REVIEW" | "PAUSED" | "CLOSED";

const phaseMap: Record<number, Phase> = {
  0: "DECLARED",
  1: "VOTING",
  2: "ACTIVE",
  3: "REVIEW",
  4: "PAUSED",
  5: "CLOSED",
};

export interface Crisis {
  id: number;
  description: string;
  phase: Phase;
  phaseId: number;
  coordinator: string;
  yesVotes: number;
  noVotes: number;
}

export function useCrisis(crisisId: number) {
  const { data, isLoading } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "getCrisis",
    args: [BigInt(crisisId)],
    enabled: crisisId > 0,
  });

  const crisis: Crisis | null = data
    ? {
        id: crisisId,
        description: (data as any)[0] as string,
        phaseId: Number((data as any)[1]),
        phase: phaseMap[Number((data as any)[1])] ?? "DECLARED",
        coordinator: (data as any)[2] as string,
        yesVotes: Number((data as any)[3]),
        noVotes: Number((data as any)[4]),
      }
    : null;

  return { crisis, isLoading };
}

export function useCrisisCount() {
  const { data, isLoading } = useScaffoldContractRead({
    contractName: "Governance",
    functionName: "nextCrisisId",
  });

  const count = data ? Number(data) : 0;
  return { count, isLoading };
}

export function useActiveCrisis() {
  const [selectedId, setSelectedId] = useState(1);
  const { crisis, isLoading } = useCrisis(selectedId);
  const { count } = useCrisisCount();

  return {
    crisis,
    selectedId,
    setSelectedId,
    crisisCount: count,
    isLoading,
  };
}
