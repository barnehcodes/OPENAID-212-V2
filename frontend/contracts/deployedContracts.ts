import RegistryAbi from "./abis/Registry.json";
import DonationManagerAbi from "./abis/DonationManager.json";
import GovernanceAbi from "./abis/Governance.json";
import ReputationEngineAbi from "./abis/ReputationEngine.json";

export const contracts = {
  Registry: {
    address: "0x42699A7612A82f1d9C36148af9C77354759b210b" as const,
    abi: RegistryAbi,
  },
  DonationManager: {
    address: "0xa50a51c09a5c451C52BB714527E1974b686D8e77" as const,
    abi: DonationManagerAbi,
  },
  Governance: {
    address: "0x9a3DBCa554e9f6b9257aAa24010DA8377C57c17e" as const,
    abi: GovernanceAbi,
  },
  ReputationEngine: {
    address: "0x2E1f232a9439C3D459FcEca0BeEf13acc8259Dd8" as const,
    abi: ReputationEngineAbi,
  },
} as const;

export type ContractName = keyof typeof contracts;
