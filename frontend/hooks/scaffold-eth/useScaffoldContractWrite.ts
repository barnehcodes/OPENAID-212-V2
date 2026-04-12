"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { contracts, type ContractName } from "@/contracts/deployedContracts";
import { toast } from "sonner";

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

  return { writeAsync, isPending, isConfirming, isSuccess, hash, error };
}
