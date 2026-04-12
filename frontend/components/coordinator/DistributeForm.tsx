"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { parseEther } from "viem";
import { Send, Loader2 } from "lucide-react";
import type { Phase } from "@/hooks/useCrisis";

interface DistributeFormProps {
  crisisId: number;
  phase: Phase;
}

export function DistributeForm({ crisisId, phase }: DistributeFormProps) {
  const [beneficiary, setBeneficiary] = useState("");
  const [amount, setAmount] = useState("");

  const { writeAsync: distribute, isPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "distributeFTToBeneficiary",
  });

  const locked = phase !== "ACTIVE";

  const handleDistribute = async () => {
    if (!beneficiary.trim() || !amount || Number(amount) <= 0) return;
    await distribute([BigInt(crisisId), beneficiary.trim(), parseEther(amount)]);
    setBeneficiary("");
    setAmount("");
  };

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="distribute">
      <h3 className="font-semibold text-openaid-black mb-4">Distribute FT to Beneficiary</h3>

      {locked && (
        <div className="bg-status-amber/10 border border-status-amber/30 rounded-lg px-4 py-3 mb-4 text-sm text-status-amber">
          Distribution is only available during the ACTIVE phase
        </div>
      )}

      <div className="space-y-4">
        <div>
          <Label className="text-xs text-openaid-mid-gray">Beneficiary Address</Label>
          <Input
            placeholder="0x..."
            value={beneficiary}
            onChange={(e) => setBeneficiary(e.target.value)}
            disabled={locked}
            className="mt-1 font-mono text-sm"
          />
          <p className="text-[10px] text-openaid-mid-gray mt-1">Must be a crisis-verified beneficiary</p>
        </div>

        <div>
          <Label className="text-xs text-openaid-mid-gray">Amount (ETH)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={locked}
            className="mt-1"
          />
        </div>

        <Button
          className="w-full bg-status-green hover:bg-status-green/90 text-white gap-2"
          disabled={locked || isPending || !beneficiary.trim() || !amount}
          onClick={handleDistribute}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Distribute {amount || "0"} ETH
        </Button>
      </div>
    </Card>
  );
}
