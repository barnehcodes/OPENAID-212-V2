"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { Shield, Megaphone, UserCheck, Loader2 } from "lucide-react";

export function AdminTools() {
  const [crisisDesc, setCrisisDesc] = useState("");
  const [verifyAddr, setVerifyAddr] = useState("");
  const [verifyCrisis, setVerifyCrisis] = useState("");

  const { writeAsync: declareCrisis, isPending: declarePending } = useScaffoldContractWrite({
    contractName: "Governance",
    functionName: "declareCrisis",
  });

  const { writeAsync: verifyBeneficiary, isPending: verifyPending } = useScaffoldContractWrite({
    contractName: "Registry",
    functionName: "verifyBeneficiary",
  });

  const handleDeclare = async () => {
    if (!crisisDesc.trim()) return;
    await declareCrisis([crisisDesc.trim()]);
    setCrisisDesc("");
  };

  const handleVerify = async () => {
    if (!verifyAddr.trim() || !verifyCrisis) return;
    await verifyBeneficiary([verifyAddr.trim(), BigInt(verifyCrisis), "0x"]);
    setVerifyAddr("");
    setVerifyCrisis("");
  };

  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="admin">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-openaid-deep-blue" />
        <h3 className="font-semibold text-openaid-black">Admin Tools</h3>
      </div>

      {/* Crisis Declaration (Tier 3) */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-status-red" />
          <span className="text-sm font-medium text-openaid-black">Declare Crisis</span>
          <span className="text-[10px] text-openaid-mid-gray bg-openaid-border rounded px-1.5 py-0.5">Tier 3</span>
        </div>
        <div>
          <Label className="text-xs text-openaid-mid-gray">Crisis Description</Label>
          <Input
            placeholder="e.g. Earthquake in Al-Haouz region"
            value={crisisDesc}
            onChange={(e) => setCrisisDesc(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button
          className="w-full bg-status-red hover:bg-status-red/90 text-white gap-2"
          disabled={declarePending || !crisisDesc.trim()}
          onClick={handleDeclare}
        >
          {declarePending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
          Declare Crisis
        </Button>
      </div>

      <Separator className="my-6" />

      {/* Verify Beneficiary (Tier 2) */}
      <div className="space-y-3" id="verify">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-status-green" />
          <span className="text-sm font-medium text-openaid-black">Verify Beneficiary</span>
          <span className="text-[10px] text-openaid-mid-gray bg-openaid-border rounded px-1.5 py-0.5">Tier 2</span>
        </div>
        <div>
          <Label className="text-xs text-openaid-mid-gray">Beneficiary Address</Label>
          <Input
            placeholder="0x..."
            value={verifyAddr}
            onChange={(e) => setVerifyAddr(e.target.value)}
            className="mt-1 font-mono text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-openaid-mid-gray">Crisis ID</Label>
          <Input
            type="number"
            min="1"
            placeholder="1"
            value={verifyCrisis}
            onChange={(e) => setVerifyCrisis(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button
          className="w-full bg-status-green hover:bg-status-green/90 text-white gap-2"
          disabled={verifyPending || !verifyAddr.trim() || !verifyCrisis}
          onClick={handleVerify}
        >
          {verifyPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
          Verify Beneficiary
        </Button>
      </div>
    </Card>
  );
}
