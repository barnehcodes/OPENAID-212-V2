"use client";

import { useReadContract } from "wagmi";
import { contracts, type ContractName } from "@/contracts/deployedContracts";

interface UseScaffoldContractReadConfig {
  contractName: ContractName;
  functionName: string;
  args?: readonly unknown[];
  enabled?: boolean;
}

export function useScaffoldContractRead({
  contractName,
  functionName,
  args,
  enabled = true,
}: UseScaffoldContractReadConfig) {
  const contract = contracts[contractName];

  return useReadContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args: args as readonly unknown[],
    query: { enabled },
  });
}
