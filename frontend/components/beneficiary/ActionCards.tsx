"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useScaffoldContractRead, useScaffoldContractWrite } from "@/hooks/scaffold-eth";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { Coins, Package, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { ConfirmModal } from "./ConfirmModal";

interface ActionCardsProps {
  crisisId: number;
}

export function ActionCards({ crisisId }: ActionCardsProps) {
  const { address } = useAccount();
  const [ftModalOpen, setFtModalOpen] = useState(false);
  const [ikModalOpen, setIkModalOpen] = useState(false);
  const [selectedNftId, setSelectedNftId] = useState(0);

  // Check FT received
  const { data: ftReceived } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "ftReceived",
    args: address ? [address, BigInt(crisisId)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  // Check if already confirmed
  const { data: hasConfirmedFT } = useScaffoldContractRead({
    contractName: "DonationManager",
    functionName: "hasBeneficiaryConfirmedFT",
    args: address ? [address, BigInt(crisisId)] : undefined,
    enabled: !!address && crisisId > 0,
  });

  const { writeAsync: confirmFT, isPending: ftPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "confirmFTReceipt",
  });

  const { writeAsync: confirmInKind, isPending: ikPending } = useScaffoldContractWrite({
    contractName: "DonationManager",
    functionName: "confirmInKindRedemption",
  });

  const ftVal = ftReceived ? formatEther(ftReceived as bigint) : "0";
  const ftConfirmed = hasConfirmedFT as boolean;
  const hasFT = !!(ftReceived && (ftReceived as bigint) > BigInt(0));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-openaid-black">
        Actions Needed
      </h2>
      <p className="text-sm text-openaid-dim-text" dir="rtl">
        الإجراءات المطلوبة
      </p>

      {/* Confirm FT Receipt */}
      <Card className="bg-openaid-card-bg border-openaid-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-status-green/10 flex items-center justify-center flex-shrink-0">
            <Coins className="w-7 h-7 text-status-green" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-openaid-black">
              Confirm you received the money
            </h3>
            <p className="text-xs text-openaid-mid-gray mt-0.5" dir="rtl">
              تأكيد استلام المبلغ
            </p>
            {hasFT && (
              <p className="text-sm text-openaid-dim-text mt-2">
                Amount received: <strong className="text-openaid-black">{ftVal} AID</strong>
              </p>
            )}
          </div>
        </div>
        <div className="mt-4">
          {ftConfirmed ? (
            <div className="flex items-center gap-2 text-status-green bg-status-green/10 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">Confirmed</span>
            </div>
          ) : (
            <Button
              className="w-full h-14 text-base bg-status-green hover:bg-status-green/90 text-white gap-2"
              disabled={!hasFT || ftPending}
              onClick={() => setFtModalOpen(true)}
            >
              {ftPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {hasFT ? "Confirm Receipt" : "No funds received yet"}
            </Button>
          )}
        </div>
      </Card>

      {/* Confirm In-Kind */}
      <Card className="bg-openaid-card-bg border-openaid-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-openaid-blue/10 flex items-center justify-center flex-shrink-0">
            <Package className="w-7 h-7 text-openaid-blue" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-openaid-black">
              Confirm you received an item
            </h3>
            <p className="text-xs text-openaid-mid-gray mt-0.5" dir="rtl">
              تأكيد استلام المواد العينية
            </p>
            <p className="text-sm text-openaid-dim-text mt-2">
              If a physical item (food, medicine, shelter) was delivered to you, confirm it here.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <Button
            className="w-full h-14 text-base bg-openaid-blue hover:bg-openaid-blue/90 text-white gap-2"
            disabled={ikPending}
            onClick={() => setIkModalOpen(true)}
          >
            {ikPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Package className="w-5 h-5" />}
            Confirm Item Received
          </Button>
        </div>
      </Card>

      {/* Modals */}
      <ConfirmModal
        open={ftModalOpen}
        onOpenChange={setFtModalOpen}
        title="Confirm Money Receipt"
        titleAr="تأكيد استلام المبلغ"
        description={`You are confirming that you received ${ftVal} AID from Crisis #${crisisId}. This action is permanent and recorded on the blockchain.`}
        onConfirm={async () => {
          await confirmFT([BigInt(crisisId)]);
          setFtModalOpen(false);
        }}
        isPending={ftPending}
      />

      <ConfirmModal
        open={ikModalOpen}
        onOpenChange={setIkModalOpen}
        title="Confirm Item Received"
        titleAr="تأكيد استلام المواد العينية"
        description="You are confirming that you received the physical item. This action is permanent and recorded on the blockchain."
        onConfirm={async () => {
          await confirmInKind([BigInt(selectedNftId)]);
          setIkModalOpen(false);
        }}
        isPending={ikPending}
        showNftInput
        nftId={selectedNftId}
        onNftIdChange={setSelectedNftId}
      />
    </div>
  );
}
