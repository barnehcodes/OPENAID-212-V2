"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddressBadge } from "@/components/ui/AddressBadge";
import { Users } from "lucide-react";

// In production, this data comes from indexing contract events
const mockBeneficiaries = [
  { address: "0x1234567890abcdef1234567890abcdef12345678", verified: true, ftReceived: "1.5 AID", ftConfirmed: true, inKind: "2 items" },
  { address: "0xabcdef1234567890abcdef1234567890abcdef12", verified: true, ftReceived: "0.8 AID", ftConfirmed: false, inKind: "1 item" },
  { address: "0x9876543210fedcba9876543210fedcba98765432", verified: true, ftReceived: "2.0 AID", ftConfirmed: true, inKind: "-" },
  { address: "0xfedcba9876543210fedcba9876543210fedcba98", verified: false, ftReceived: "-", ftConfirmed: false, inKind: "-" },
];

export function BeneficiaryLedger() {
  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6" id="ledger">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-openaid-deep-blue" />
        <h3 className="font-semibold text-openaid-black">Beneficiary Ledger</h3>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Address</TableHead>
              <TableHead className="text-xs">Verified</TableHead>
              <TableHead className="text-xs">FT Received</TableHead>
              <TableHead className="text-xs">FT Confirmed</TableHead>
              <TableHead className="text-xs">In-Kind</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockBeneficiaries.map((b) => (
              <TableRow key={b.address}>
                <TableCell>
                  <AddressBadge address={b.address} />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={b.verified ? "bg-status-green/15 text-status-green border-status-green/30 text-[10px]" : "bg-status-amber/15 text-status-amber border-status-amber/30 text-[10px]"}>
                    {b.verified ? "Verified" : "Pending"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-mono">{b.ftReceived}</TableCell>
                <TableCell>
                  {b.ftConfirmed ? (
                    <Badge variant="outline" className="bg-status-green/15 text-status-green border-status-green/30 text-[10px]">
                      Confirmed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-openaid-border text-openaid-mid-gray text-[10px]">
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">{b.inKind}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
