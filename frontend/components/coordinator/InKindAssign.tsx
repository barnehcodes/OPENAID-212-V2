"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { Package, Loader2 } from "lucide-react";
import type { Phase } from "@/hooks/useCrisis";

interface InKindAssignProps {
  crisisId: number;
  phase: Phase;
}

export function InKindAssign({ crisisId, phase }: InKindAssignProps) {
  const [nftId, setNftId] = useState("");
  const [beneficiary, setBeneficiary] = useState("");

  const { writeAsync: assign, isPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "assignInKindToBeneficiary",
  });

  const locked = phase !== "ACTIVE";

  const handleAssign = async () => {
    if (!nftId || !beneficiary.trim()) return;
    await assign([BigInt(crisisId), BigInt(nftId), beneficiary.trim()]);
    setNftId("");
    setBeneficiary("");
  };

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-5 h-5 text-openaid-blue" />
        <h3 className="font-semibold text-openaid-black">Assign In-Kind Item</h3>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-xs text-openaid-mid-gray">NFT Token ID</Label>
          <Input
            type="number"
            min="0"
            placeholder="Token ID of the in-kind item"
            value={nftId}
            onChange={(e) => setNftId(e.target.value)}
            disabled={locked}
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs text-openaid-mid-gray">Beneficiary Address</Label>
          <Input
            placeholder="0x..."
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            disabled={locked}
            className="mt-1 font-mono text-sm"
          />
        </div>

        <Button
          className="w-full bg-openaid-blue hover:bg-openaid-blue/90 text-white gap-2"
          disabled={locked || isPending || !nftId || !beneficiary.trim()}
          onClick={handleAssign}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
          Assign Item
        </Button>
      </div>
    </Card>
  );
}
