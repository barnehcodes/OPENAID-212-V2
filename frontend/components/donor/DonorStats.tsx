"use client";

import { Coins, TrendingUp, Vote, Award } from "lucide-react";
import { StatsCard } from "@/components/shared";
import { useScaffoldContractRead } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { formatEther } from "viem";

interface DonorStatsProps {
  crisisId: number;
}

export function DonorStats({ crisisId }: DonorStatsProps) {
  const { address } = useAccount();

  const { data: contribution } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "donorContribution",
    args: address ? [address, BigInt(crisisId)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  const { data: totalSupply } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "totalSupply",
  });

  const { data: samaritanScore } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "getSamaritanScore",
    args: address ? [address] : undefined,
    enabled: !!address,
  });

  const contributionVal = contribution ? formatEther(contribution as bigint) : "0";
  const totalVal = totalSupply ? formatEther(totalSupply as bigint) : "0";
  const samaritanVal = samaritanScore ? Number(samaritanScore) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        icon={Coins}
        label="Total Donated"
        value={`${totalVal} ETH`}
        sub="Across all crises"
        iconColor="text-openaid-deep-blue"
        iconBg="bg-openaid-deep-blue/10"
      />
      <StatsCard
        icon={TrendingUp}
        label="This Crisis"
        value={`${contributionVal} ETH`}
        sub={`Crisis #${crisisId}`}
        iconColor="text-status-green"
        iconBg="bg-status-green/10"
      />
      <StatsCard
        icon={Vote}
        label="Voting Eligibility"
        value={Number(contributionVal) > 0 ? "Eligible" : "Not Yet"}
        sub="1x base donation cap"
        iconColor="text-status-amber"
        iconBg="bg-status-amber/10"
      />
      <StatsCard
        icon={Award}
        label="Samaritan Score"
        value={samaritanVal}
        sub="Track donations to earn"
        iconColor="text-openaid-blue"
        iconBg="bg-openaid-blue/10"
      />
    </div>
  );
}
