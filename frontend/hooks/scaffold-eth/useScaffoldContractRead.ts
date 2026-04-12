"use client";

import { useReadContract } from "wagmi";
import { contracts, type ContractName } from "@/contracts/deployedContracts";
import { IS_PREVIEW } from "@/lib/previewMode";
import { mockReadResponse } from "@/lib/mockContractResponses";

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

  const live = useReadContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args: args as readonly unknown[],
    query: { enabled: enabled && !IS_PREVIEW },
  });

  if (IS_PREVIEW) {
    return {
      data: mockReadResponse(contractName, functionName, args),
      isLoading: false,
      error: null,
      refetch: async () => ({ data: undefined } as never),
    } as unknown as ReturnType<typeof useReadContract>;
  }

  return live;
}
