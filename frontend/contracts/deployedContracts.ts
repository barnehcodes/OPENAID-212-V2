import RegistryAbi from "./abis/Registry.json";
import DonationManagerAbi from "./abis/DonationManager.json";
import GovernanceAbi from "./abis/Governance.json";
import ReputationEngineAbi from "./abis/ReputationEngine.json";

export const contracts = {
  Registry: {
    address: "0x0Be199A777EECc870a7b13045946Fef1803Dd9e1" as const,
    abi: RegistryAbi,
  },
  DonationManager: {
    address: "0xf03b5af17792D7F7707dc54474083BaCAD17e22F" as const,
    abi: DonationManagerAbi,
  },
  Governance: {
    address: "0x36A8bE2C24f812ed7a95f14ffEBDB5F778F61699" as const,
    abi: GovernanceAbi,
  },
  ReputationEngine: {
    address: "0xD6470D46e2062c4E428375e2D21a0e549B104f3B" as const,
    abi: ReputationEngineAbi,
  },
} as const;

export type ContractName = keyof typeof contracts;
