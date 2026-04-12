export type MockPhase = "DECLARED" | "VOTING" | "ACTIVE" | "REVIEW" | "PAUSED" | "CLOSED";

export interface MockCrisis {
  id: number;
  description: string;
  phaseId: number;
  phase: MockPhase;
  coordinator: string;
  yesVotes: number;
  noVotes: number;
  declaredAt: string;
  region: string;
  totalDonations: number;
  beneficiaries: number;
  distributedPct: number;
}

export const mockCrises: MockCrisis[] = [
  {
    id: 1,
    description: "Al Haouz Earthquake Relief - Marrakech-Safi region",
    phaseId: 2,
    phase: "ACTIVE",
    coordinator: "0xA11CE0000000000000000000000000000000A11C",
    yesVotes: 12,
    noVotes: 1,
    declaredAt: "2025-09-08",
    region: "Al Haouz, Marrakech-Safi",
    totalDonations: 482_500,
    beneficiaries: 1240,
    distributedPct: 64,
  },
  {
    id: 2,
    description: "Tetouan Floods Emergency Aid",
    phaseId: 1,
    phase: "VOTING",
    coordinator: "0x0000000000000000000000000000000000000000",
    yesVotes: 0,
    noVotes: 0,
    declaredAt: "2026-03-22",
    region: "Tetouan, Tangier-Tetouan",
    totalDonations: 87_300,
    beneficiaries: 320,
    distributedPct: 0,
  },
  {
    id: 3,
    description: "Drought Relief - Souss-Massa Agricultural Crisis",
    phaseId: 3,
    phase: "REVIEW",
    coordinator: "0xB0B0000000000000000000000000000000000B0B",
    yesVotes: 9,
    noVotes: 4,
    declaredAt: "2025-11-15",
    region: "Souss-Massa",
    totalDonations: 215_800,
    beneficiaries: 680,
    distributedPct: 41,
  },
  {
    id: 4,
    description: "Errachidia Cold Wave Response",
    phaseId: 5,
    phase: "CLOSED",
    coordinator: "0xC0FFEE000000000000000000000000000000C0FF",
    yesVotes: 11,
    noVotes: 0,
    declaredAt: "2025-01-12",
    region: "Drâa-Tafilalet",
    totalDonations: 156_000,
    beneficiaries: 410,
    distributedPct: 100,
  },
];

export const mockCandidates: string[] = [
  "0xA11CE0000000000000000000000000000000A11C",
  "0xB0B0000000000000000000000000000000000B0B",
  "0xCAFE000000000000000000000000000000000CAF",
];

export const mockTransactions = [
  { id: "tx1", type: "Donation", from: "Donor #142", amount: "5,000 MAD", crisis: "Al Haouz Earthquake", time: "2 min ago" },
  { id: "tx2", type: "Distribution", from: "Coordinator A11C", amount: "1,200 MAD", crisis: "Al Haouz Earthquake", time: "8 min ago" },
  { id: "tx3", type: "Vote", from: "NGO Morocco Relief", amount: "-", crisis: "Tetouan Floods", time: "14 min ago" },
  { id: "tx4", type: "Verification", from: "GO Authority", amount: "-", crisis: "Souss-Massa Drought", time: "27 min ago" },
  { id: "tx5", type: "In-Kind", from: "Atlas Logistics", amount: "200 blankets", crisis: "Errachidia Cold Wave", time: "1 hr ago" },
];

export const mockReputation = [
  { addr: "0xA11C…A11C", score: 9420, role: "Coordinator", trend: "+12" },
  { addr: "0xB0B0…0B0B", score: 8610, role: "NGO", trend: "+4" },
  { addr: "0xCAFE…0CAF", score: 7980, role: "NGO", trend: "-2" },
  { addr: "0xD0D0…0D0D", score: 7155, role: "Donor", trend: "+8" },
];

const ETH = BigInt(10) ** BigInt(18);
export const mockSamaritanScore = BigInt(8420);
export const mockDonorContribution = BigInt(12_500) * ETH;
export const mockTotalSupply = BigInt(4_820_000) * ETH;
export const mockEscrow = BigInt(482_500) * ETH;
export const mockFtReceived = BigInt(1_500) * ETH;
export const mockFtConfirmed = BigInt(800) * ETH;
