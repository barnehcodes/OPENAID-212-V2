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
import { UserCheck } from "lucide-react";

const verifiedBeneficiaries = [
  { address: "0x1234567890abcdef1234567890abcdef12345678", crisis: 1, region: "Al Haouz", verifiedAt: "2025-09-12", aidReceived: "1.5 AID" },
  { address: "0xabcdef1234567890abcdef1234567890abcdef12", crisis: 1, region: "Al Haouz", verifiedAt: "2025-09-13", aidReceived: "0.8 AID" },
  { address: "0x9876543210fedcba9876543210fedcba98765432", crisis: 1, region: "Marrakech", verifiedAt: "2025-09-15", aidReceived: "2.0 AID" },
  { address: "0xfedcba9876543210fedcba9876543210fedcba98", crisis: 3, region: "Souss-Massa", verifiedAt: "2025-11-20", aidReceived: "0.5 AID" },
  { address: "0x0011223344556677889900112233445566778899", crisis: 3, region: "Souss-Massa", verifiedAt: "2025-11-22", aidReceived: "1.2 AID" },
];

export function BeneficiaryList() {
  return (
    <Card className="bg-openaid-card-bg border-openaid-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <UserCheck className="w-5 h-5 text-status-green" />
        <h3 className="font-semibold text-openaid-black">Verified Beneficiaries</h3>
        <Badge variant="outline" className="ml-auto bg-status-green/10 text-status-green border-status-green/30 text-[10px]">
          {verifiedBeneficiaries.length} total
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Address</TableHead>
              <TableHead className="text-xs">Crisis</TableHead>
              <TableHead className="text-xs">Region</TableHead>
              <TableHead className="text-xs">Verified</TableHead>
              <TableHead className="text-xs">Aid Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {verifiedBeneficiaries.map((b) => (
              <TableRow key={b.address}>
                <TableCell>
                  <AddressBadge address={b.address} />
                </TableCell>
                <TableCell className="text-sm">#{b.crisis}</TableCell>
                <TableCell className="text-sm text-openaid-dim-text">{b.region}</TableCell>
                <TableCell className="text-xs text-openaid-mid-gray font-mono">{b.verifiedAt}</TableCell>
                <TableCell className="text-sm font-mono">{b.aidReceived}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
