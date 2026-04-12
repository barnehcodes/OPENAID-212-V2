"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { AddressBadge } from "@/components/ui/AddressBadge";
import { RadialGauge } from "@/components/ui/RadialGauge";
import { ReputationBar } from "@/components/shared";
import { TransactionFeed, type FeedItem } from "@/components/shared";
import { Eye, Search, Coins, Users, Activity, Shield, ExternalLink } from "lucide-react";

// Mock data for demo — in production these come from event indexing
const crises = [
  { id: 1, name: "Al-Haouz Earthquake Relief", phase: "ACTIVE", donated: "2,450 ETH", beneficiaries: 1240, coordinator: "0xa1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4" },
  { id: 2, name: "Taroudant Flood Response", phase: "VOTING", donated: "340 ETH", beneficiaries: 320, coordinator: "0x0000000000000000000000000000000000000000" },
  { id: 3, name: "Chefchaouen Landslide Aid", phase: "CLOSED", donated: "890 ETH", beneficiaries: 540, coordinator: "0xe5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890" },
];

const recentTransactions: FeedItem[] = [
  { id: "1", type: "donation", description: "Donated 5.0 ETH to Crisis #1", address: "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73", amount: "5.0 ETH", timestamp: "Block #4521" },
  { id: "2", type: "distribution", description: "Distributed 1.2 ETH to beneficiary", address: "0xa1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4", amount: "1.2 ETH", timestamp: "Block #4520" },
  { id: "3", type: "vote", description: "Vote cast in Crisis #2 election", address: "0x9876543210fedcba9876543210fedcba98765432", timestamp: "Block #4518" },
  { id: "4", type: "confirm", description: "Beneficiary confirmed FT receipt", address: "0xabcdef1234567890abcdef1234567890abcdef12", amount: "0.8 ETH", timestamp: "Block #4516" },
  { id: "5", type: "inkind", description: "In-kind donation: Medical supplies", address: "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73", timestamp: "Block #4514" },
  { id: "6", type: "misconduct", description: "Misconduct vote initiated for coordinator", address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", timestamp: "Block #4510" },
];

const actors = [
  { label: "NGO Relief Fund", score: 92, trend: "+3" },
  { label: "GO Regional Auth", score: 95, trend: "+1" },
  { label: "Coordinator Alpha", score: 78, trend: "-5" },
  { label: "Coordinator Beta", score: 34, trend: "-22", flagged: true },
];

export default function TransparencyExplorerPage() {
  const [search, setSearch] = useState("");

  return (
    <div>
      {/* Header */}
      <div className="px-8 py-6 border-b border-openaid-border bg-openaid-cream/80">
        <div className="flex items-center gap-3 mb-4">
          <Eye className="w-6 h-6 text-openaid-deep-blue" />
          <h1 className="text-xl font-semibold text-openaid-black">Transparency Explorer</h1>
        </div>
        <p className="text-sm text-openaid-dim-text mb-4">
          Public ledger — no wallet connection required. Every transaction, donation, and distribution is verifiable.
        </p>

        {/* Search */}
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-openaid-mid-gray" />
          <Input
            placeholder="Search by address, crisis ID, or transaction..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="p-6 lg:p-8 space-y-6">
        {/* Overview stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-openaid-card-bg border-openaid-border p-5 text-center">
            <Coins className="w-6 h-6 text-openaid-deep-blue mx-auto mb-2" />
            <p className="text-2xl font-bold text-openaid-black">3,680 ETH</p>
            <p className="text-xs text-openaid-mid-gray">Total Donated</p>
          </Card>
          <Card className="bg-openaid-card-bg border-openaid-border p-5 text-center">
            <Users className="w-6 h-6 text-status-green mx-auto mb-2" />
            <p className="text-2xl font-bold text-openaid-black">2,100</p>
            <p className="text-xs text-openaid-mid-gray">Beneficiaries Served</p>
          </Card>
          <Card className="bg-openaid-card-bg border-openaid-border p-5 text-center">
            <Activity className="w-6 h-6 text-status-amber mx-auto mb-2" />
            <p className="text-2xl font-bold text-openaid-black">3</p>
            <p className="text-xs text-openaid-mid-gray">Active Crises</p>
          </Card>
          <Card className="bg-openaid-card-bg border-openaid-border p-5 text-center">
            <Shield className="w-6 h-6 text-openaid-blue mx-auto mb-2" />
            <p className="text-2xl font-bold text-openaid-black">186</p>
            <p className="text-xs text-openaid-mid-gray">Verified Actors</p>
          </Card>
        </div>

        <Tabs defaultValue="crises">
          <TabsList>
            <TabsTrigger value="crises">Crises</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="reputation">Reputation</TabsTrigger>
          </TabsList>

          {/* Crises tab */}
          <TabsContent value="crises" className="mt-4">
            <Card className="bg-openaid-card-bg border-openaid-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">ID</TableHead>
                    <TableHead className="text-xs">Crisis</TableHead>
                    <TableHead className="text-xs">Phase</TableHead>
                    <TableHead className="text-xs">Donated</TableHead>
                    <TableHead className="text-xs">Beneficiaries</TableHead>
                    <TableHead className="text-xs">Coordinator</TableHead>
                    <TableHead className="text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crises.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">#{c.id}</TableCell>
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell><PhaseBadge phase={c.phase} /></TableCell>
                      <TableCell className="font-mono text-sm">{c.donated}</TableCell>
                      <TableCell className="text-sm">{c.beneficiaries.toLocaleString()}</TableCell>
                      <TableCell>
                        {c.coordinator !== "0x0000000000000000000000000000000000000000" ? (
                          <AddressBadge address={c.coordinator} />
                        ) : (
                          <span className="text-xs text-openaid-mid-gray">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/crisis/${c.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1 text-xs">
                            Details <ExternalLink className="w-3 h-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Transactions tab */}
          <TabsContent value="transactions" className="mt-4">
            <Card className="bg-openaid-card-bg border-openaid-border p-6">
              <TransactionFeed items={recentTransactions} />
            </Card>
          </TabsContent>

          {/* Reputation tab */}
          <TabsContent value="reputation" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-openaid-card-bg border-openaid-border p-6">
                <h3 className="font-semibold text-openaid-black mb-4">Actor Reputation Scores</h3>
                <div className="space-y-4">
                  {actors.map((a) => (
                    <ReputationBar key={a.label} {...a} />
                  ))}
                </div>
              </Card>
              <Card className="bg-openaid-card-bg border-openaid-border p-6 flex flex-col items-center justify-center">
                <h3 className="font-semibold text-openaid-black mb-6">System Health</h3>
                <div className="flex items-center gap-8">
                  <RadialGauge value={87} label="Avg Score" size={100} color="auto" />
                  <RadialGauge value={96} label="Confirm Rate" size={100} color="#4CAF8B" />
                  <RadialGauge value={73} label="Distribution %" size={100} color="#D4A03A" />
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
