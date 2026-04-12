import {
  mockCandidates,
  mockCrises,
  mockDonorContribution,
  mockEscrow,
  mockFtConfirmed,
  mockFtReceived,
  mockSamaritanScore,
  mockTotalSupply,
} from "./mockData";

type Resolver = (args?: readonly unknown[]) => unknown;

const registry: Record<string, Record<string, Resolver>> = {
  Registry: {
    isCrisisVerifiedBeneficiary: () => true,
    isVerified: () => true,
  },
  DonationManager: {
    crisisEscrow: () => mockEscrow,
    donorContribution: () => mockDonorContribution,
    totalSupply: () => mockTotalSupply,
    getSamaritanScore: () => mockSamaritanScore,
    hasDonorTrackedCrisis: () => true,
    ftReceived: () => mockFtReceived,
    ftConfirmed: () => mockFtConfirmed,
    hasBeneficiaryConfirmedFT: () => false,
  },
  Governance: {
    nextCrisisId: () => BigInt(mockCrises.length + 1),
    electionRound: () => BigInt(1),
    hasVoted: () => false,
    getCandidates: () => mockCandidates,
    getCrisis: (args) => {
      const id = args && args[0] ? Number(args[0]) : 1;
      const c = mockCrises.find((x) => x.id === id) ?? mockCrises[0];
      return [c.description, c.phaseId, c.coordinator, BigInt(c.yesVotes), BigInt(c.noVotes)];
    },
  },
  ReputationEngine: {
    getReputation: () => BigInt(8420),
  },
};

export function mockReadResponse(contractName: string, functionName: string, args?: readonly unknown[]) {
  const resolver = registry[contractName]?.[functionName];
  if (!resolver) return undefined;
  return resolver(args);
}
