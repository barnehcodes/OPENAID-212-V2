"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contracts, type ContractName } from "@/contracts/deployedContracts";
import { toast } from "sonner";
import { IS_PREVIEW } from "@/lib/previewMode";

interface UseScaffoldContractWriteConfig {
  contractName: ContractName;
  functionName: string;
}

export function useScaffoldContractWrite({
  contractName,
  functionName,
}: UseScaffoldContractWriteConfig) {
  const contract = contracts[contractName];
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const writeAsync = async (args?: readonly unknown[], value?: bigint) => {
    if (IS_PREVIEW) {
      toast.success("Preview mode - transaction simulated", {
        description: `${contractName}.${functionName}`,
      });
      return ("0xPREVIEW" + Math.random().toString(16).slice(2)) as `0x${string}`;
    }
    try {
      const toastId = toast.loading("Sending transaction...");
      const txHash = await writeContractAsync({
        address: contract.address,
        abi: contract.abi,
        functionName,
        args: args as readonly unknown[],
        value,
      });
      toast.dismiss(toastId);
      toast.success("Transaction submitted", {
        description: `${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
      });
      return txHash;
    } catch (e: unknown) {
      toast.dismiss();
      const message = e instanceof Error ? e.message : "Unknown error";
      toast.error("Transaction failed", { description: message.slice(0, 100) });
      throw e;
    }
  };

  if (IS_PREVIEW) {
    return {
      writeAsync,
      isPending: false,
      isConfirming: false,
      isSuccess: false,
      hash: undefined,
      error: null,
    };
  }

  return { writeAsync, isPending, isConfirming, isSuccess, hash, error };
}
