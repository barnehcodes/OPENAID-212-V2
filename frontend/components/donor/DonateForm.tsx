"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { parseEther, isAddress } from "viem";
import { Coins, Package, Loader2, Target, Users } from "lucide-react";
import type { Phase } from "@/hooks/useCrisis";

interface DonateFormProps {
  crisisId: number;
  phase: Phase;
}

const quickAmounts = ["0.1", "0.5", "1", "5", "10"];

type Mode = "crisis" | "direct";

export function DonateForm({ crisisId, phase }: DonateFormProps) {
  const [mode, setMode] = useState<Mode>("crisis");
  const [ftAmount, setFtAmount] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [directAddress, setDirectAddress] = useState("");

  const { writeAsync: donateFT, isPending: ftPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "donateFT",
  });

  const { writeAsync: donateInKind, isPending: ikPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "donateInKind",
  });

  const { writeAsync: directDonateFT, isPending: directPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "directDonateFT",
  });

  const locked = mode === "crisis" && phase === "CLOSED";
  const directValid = isAddress(directAddress.trim());

  const handleFTDonate = async () => {
    if (!ftAmount || Number(ftAmount) <= 0) return;
    if (mode === "direct") {
      if (!directValid) return;
      await directDonateFT([directAddress.trim() as `0x${string}`], parseEther(ftAmount));
    } else {
      await donateFT([BigInt(crisisId)], parseEther(ftAmount));
    }
    setFtAmount("");
  };

  const handleInKindDonate = async () => {
    if (!metadataURI.trim()) return;
    await donateInKind([BigInt(crisisId), metadataURI.trim()]);
    setMetadataURI("");
  };

  const ftBusy = ftPending || directPending;

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="donate">
      <h3 className="font-semibold text-openaid-black mb-4">Quick Donate</h3>

      {/* Mode toggle: Direct vs In-Crisis */}
      <div className="grid grid-cols-2 gap-2 mb-5 p-1 bg-openaid-border/40 rounded-lg">
        <button
          onClick={() => setMode("crisis")}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === "crisis"
              ? "bg-white text-openaid-deep-blue shadow-sm"
              : "text-openaid-mid-gray hover:text-openaid-black"
          }`}
        >
          <Target className="w-4 h-4" /> In-Crisis
        </button>
        <button
          onClick={() => setMode("direct")}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === "direct"
              ? "bg-white text-openaid-deep-blue shadow-sm"
              : "text-openaid-mid-gray hover:text-openaid-black"
          }`}
        >
          <Users className="w-4 h-4" /> Direct
        </button>
      </div>

      <p className="text-xs text-openaid-dim-text mb-4">
        {mode === "crisis"
          ? `Contribute to Crisis #${crisisId}'s escrow. Grants voting power.`
          : "Send AID directly to a beneficiary's wallet. No voting power granted."}
      </p>

      {locked && (
        <div className="bg-status-amber/10 border border-status-amber/30 rounded-lg px-4 py-3 mb-4 text-sm text-status-amber">
          This crisis is closed. Leftover escrow can be redirected to an open crisis.
        </div>
      )}

      <Tabs defaultValue="ft">
        <TabsList className="mb-4">
          <TabsTrigger value="ft" className="gap-1.5">
            <Coins className="w-3.5 h-3.5" /> Fungible Token
          </TabsTrigger>
          <TabsTrigger value="inkind" className="gap-1.5" disabled={mode === "direct"}>
            <Package className="w-3.5 h-3.5" /> In-Kind
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ft" className="space-y-4">
          {mode === "direct" && (
            <div>
              <Label className="text-xs text-openaid-mid-gray">Beneficiary Wallet</Label>
              <Input
                placeholder="0x..."
                value={directAddress}
                onChange={(e) => setDirectAddress(e.target.value)}
                className="mt-1 font-mono text-sm"
              />
              {directAddress && !directValid && (
                <p className="text-[10px] text-status-red mt-1">Invalid address</p>
              )}
            </div>
          )}
          <div>
            <Label className="text-xs text-openaid-mid-gray">Amount (AID)</Label>
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
                {amt} AID
              </Button>
            ))}
          </div>
          <Button
            className="w-full bg-openaid-deep-blue hover:bg-openaid-deep-blue/90 text-white gap-2"
            disabled={locked || ftBusy || !ftAmount || (mode === "direct" && !directValid)}
            onClick={handleFTDonate}
          >
            {ftBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
            {mode === "direct"
              ? `Send ${ftAmount || "0"} AID directly`
              : `Donate ${ftAmount || "0"} AID to Crisis #${crisisId}`}
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
