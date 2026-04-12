"use client";

import { useWatchContractEvent } from "wagmi";
import { contracts, type ContractName } from "@/contracts/deployedContracts";
import { useState, useCallback } from "react";
import type { Log } from "viem";
import { IS_PREVIEW } from "@/lib/previewMode";

interface UseScaffoldEventHistoryConfig {
  contractName: ContractName;
  eventName: string;
  fromBlock?: bigint;
  enabled?: boolean;
}

export function useScaffoldEventHistory({
  contractName,
  eventName,
  enabled = true,
}: UseScaffoldEventHistoryConfig) {
  const contract = contracts[contractName];
  const [events, setEvents] = useState<Log[]>([]);

  const onLogs = useCallback((logs: Log[]) => {
    setEvents(prev => [...prev, ...logs]);
  }, []);

  useWatchContractEvent({
    address: contract.address,
    abi: contract.abi,
    eventName,
    onLogs,
    enabled: enabled && !IS_PREVIEW,
  });

  if (IS_PREVIEW) {
    return { data: [] as Log[] };
  }

  return { data: events };
}
