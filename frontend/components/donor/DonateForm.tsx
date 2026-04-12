"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { parseEther } from "viem";
import { Coins, Package, Loader2 } from "lucide-react";
import type { Phase } from "@/hooks/useCrisis";

interface DonateFormProps {
  crisisId: number;
  phase: Phase;
}

const quickAmounts = ["0.1", "0.5", "1", "5", "10"];

export function DonateForm({ crisisId, phase }: DonateFormProps) {
  const [ftAmount, setFtAmount] = useState("");
  const [metadataURI, setMetadataURI] = useState("");

  const { writeAsync: donateFT, isPending: ftPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "donateFT",
  });

  const { writeAsync: donateInKind, isPending: ikPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "donateInKind",
  });

  const locked = phase === "ACTIVE" || phase === "CLOSED" || phase === "REVIEW" || phase === "PAUSED";

  const handleFTDonate = async () => {
    if (!ftAmount || Number(ftAmount) <= 0) return;
    await donateFT([BigInt(crisisId)], parseEther(ftAmount));
    setFtAmount("");
  };

  const handleInKindDonate = async () => {
    if (!metadataURI.trim()) return;
    await donateInKind([BigInt(crisisId), metadataURI.trim()]);
    setMetadataURI("");
  };

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="donate">
      <h3 className="font-semibold text-openaid-black mb-4">Quick Donate</h3>

      {locked && (
        <div className="bg-status-amber/10 border border-status-amber/30 rounded-lg px-4 py-3 mb-4 text-sm text-status-amber">
          Donations are locked during the {phase} phase
        </div>
      )}

      <Tabs defaultValue="ft">
        <TabsList className="mb-4">
          <TabsTrigger value="ft" className="gap-1.5">
            <Coins className="w-3.5 h-3.5" /> Fungible Token
          </TabsTrigger>
          <TabsTrigger value="inkind" className="gap-1.5">
            <Package className="w-3.5 h-3.5" /> In-Kind
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ft" className="space-y-4">
          <div>
            <Label className="text-xs text-openaid-mid-gray">Amount (ETH)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={ftAmount}
              onChange={(e) => setFtAmount(e.target.value)}
              disabled={locked}
              className="mt-1"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {quickAmounts.map((amt) => (
              <Button
                key={amt}
                variant="outline"
                size="sm"
                disabled={locked}
                onClick={() => setFtAmount(amt)}
                className="text-xs"
              >
                {amt} ETH
              </Button>
            ))}
          </div>
          <Button
            className="w-full bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
            disabled={locked || ftPending || !ftAmount}
            onClick={handleFTDonate}
          >
            {ftPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            Donate {ftAmount || "0"} ETH to Crisis #{crisisId}
          </Button>
        </TabsContent>

        <TabsContent value="inkind" className="space-y-4">
          <div>
            <Label className="text-xs text-openaid-mid-gray">Metadata URI (IPFS or description)</Label>
            <Input
              placeholder="ipfs://... or item description"
              value={metadataURI}
              onChange={(e) => setMetadataURI(e.target.value)}
              disabled={locked}
              className="mt-1"
            />
          </div>
          <Button
            className="w-full bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
            disabled={locked || ikPending || !metadataURI.trim()}
            onClick={handleInKindDonate}
          >
            {ikPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Donate In-Kind Item
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
