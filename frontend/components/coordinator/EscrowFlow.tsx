"use client";

import { Card } from "@/components/ui/card";
import { ArrowRight, Users, Coins, Shield, Ban } from "lucide-react";

interface EscrowFlowProps {
  escrowTotal: string;
  distributed: string;
}

export function EscrowFlow({ escrowTotal, distributed }: EscrowFlowProps) {
  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <h3 className="font-semibold text-openaid-black mb-6">Escrow Flow</h3>
      <div className="flex items-center justify-between gap-2">
        {/* Donors */}
        <div className="flex-1 bg-openaid-deep-blue/10 rounded-xl p-4 text-center">
          <Users className="w-6 h-6 text-openaid-deep-blue mx-auto mb-2" />
          <p className="text-xs font-medium text-openaid-black">Donors</p>
        </div>

        <ArrowRight className="w-5 h-5 text-openaid-mid-gray flex-shrink-0" />

        {/* Contract Escrow */}
        <div className="flex-1 bg-status-amber/10 rounded-xl p-4 text-center">
          <Coins className="w-6 h-6 text-status-amber mx-auto mb-2" />
          <p className="text-xs font-medium text-openaid-black">Contract Escrow</p>
          <p className="text-sm font-bold text-openaid-black mt-1">{escrowTotal}</p>
        </div>

        <ArrowRight className="w-5 h-5 text-openaid-mid-gray flex-shrink-0" />

        {/* Coordinator (Authority) */}
        <div className="flex-1 bg-openaid-card-bg rounded-xl p-4 text-center border-2 border-dashed border-openaid-border">
          <Shield className="w-6 h-6 text-openaid-mid-gray mx-auto mb-2" />
          <p className="text-xs font-medium text-openaid-black">You (Authority)</p>
          <div className="flex items-center justify-center gap-1 mt-1">
            <Ban className="w-3 h-3 text-status-red" />
            <p className="text-[10px] text-status-red font-medium">No funds held</p>
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-openaid-mid-gray flex-shrink-0" />

        {/* Beneficiaries */}
        <div className="flex-1 bg-status-green/10 rounded-xl p-4 text-center">
          <Users className="w-6 h-6 text-status-green mx-auto mb-2" />
          <p className="text-xs font-medium text-openaid-black">Beneficiaries</p>
          <p className="text-sm font-bold text-openaid-black mt-1">{distributed}</p>
        </div>
      </div>
    </Card>
  );
}
