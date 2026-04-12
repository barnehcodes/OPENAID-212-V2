"use client";

import { Card } from "@/components/ui/card";
import { TransactionFeed, type FeedItem } from "@/components/shared";
import { useScaffoldEventHistory } from "@/hooks/scaffold-eth";
import { Activity } from "lucide-react";
import { useAccount } from "wagmi";

export function ActivityFeed() {
  const { address } = useAccount();

  const { data: ftEvents } = useScaffoldEventHistory({
    contractName: "DonationManager",
    eventName: "FTDonationReceived",
    enabled: !!address,
  });

  const { data: voteEvents } = useScaffoldEventHistory({
    contractName: "Governance",
    eventName: "VoteCast",
    enabled: !!address,
  });

  // Transform blockchain events into feed items
  const items: FeedItem[] = [
    ...ftEvents.map((e, i) => ({
      id: `ft-${i}`,
      type: "donation" as const,
      description: "FT Donation sent",
      address: (e as any).args?.donor ?? "",
      amount: "ETH",
      timestamp: "Recent",
    })),
    ...voteEvents.map((e, i) => ({
      id: `vote-${i}`,
      type: "vote" as const,
      description: "Vote cast in election",
      address: (e as any).args?.voter ?? "",
      timestamp: "Recent",
    })),
  ].slice(0, 10);

  // If no live events, show mock data for demo
  const displayItems = items.length > 0 ? items : [
    { id: "1", type: "donation" as const, description: "Donated 2.5 ETH to Crisis #1", amount: "2.5 ETH", timestamp: "2 min ago" },
    { id: "2", type: "vote" as const, description: "Voted for coordinator candidate", timestamp: "1 hour ago" },
    { id: "3", type: "confirm" as const, description: "Tracked donation for Crisis #1", timestamp: "3 hours ago" },
    { id: "4", type: "donation" as const, description: "Donated 1.0 ETH to Crisis #2", amount: "1.0 ETH", timestamp: "1 day ago" },
  ];

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-openaid-deep-blue" />
        <h3 className="font-semibold text-openaid-black">Recent Activity</h3>
      </div>
      <TransactionFeed items={displayItems} />
    </Card>
  );
}
